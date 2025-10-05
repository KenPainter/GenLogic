// Diff Engine Unit Tests
import { describe, test, expect, beforeEach } from 'bun:test';
import { DiffEngine } from '../../src/diff-engine.js';
import type { ProcessedSchema, ProcessedTable } from '../../src/schema-processor.js';
import type { DatabaseTable, DatabaseColumn } from '../../src/types.js';

describe('DiffEngine', () => {
  let engine: DiffEngine;

  beforeEach(() => {
    engine = new DiffEngine();
  });

  describe('Table creation', () => {
    test('should detect new table', () => {
      const desiredSchema: ProcessedSchema = {
        tables: {
          users: {
            columns: {
              id: { type: 'integer', primary_key: true, sequence: true },
              name: { type: 'varchar', size: 100 }
            },
            generatedColumns: {},
            foreignKeys: {}
          }
        }
      };

      const currentSchema: Record<string, DatabaseTable> = {};

      const diff = engine.generateDiff(desiredSchema, currentSchema);

      expect(diff.tablesToCreate).toHaveLength(1);
      expect(diff.tablesToCreate[0].tableName).toBe('users');
      expect(diff.tablesToCreate[0].columns).toHaveLength(2);
    });

    test('should include both explicit and generated columns in new table', () => {
      const desiredSchema: ProcessedSchema = {
        tables: {
          posts: {
            columns: {
              id: { type: 'integer', primary_key: true },
              title: { type: 'varchar', size: 200 }
            },
            generatedColumns: {
              user_id: { type: 'integer' }
            },
            foreignKeys: {
              user: { table: 'users' }
            }
          }
        }
      };

      const currentSchema: Record<string, DatabaseTable> = {};

      const diff = engine.generateDiff(desiredSchema, currentSchema);

      expect(diff.tablesToCreate[0].columns).toHaveLength(3);
      const columnNames = diff.tablesToCreate[0].columns.map(c => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('title');
      expect(columnNames).toContain('user_id');
    });
  });

  describe('Column additions', () => {
    test('should detect new column in existing table', () => {
      const desiredSchema: ProcessedSchema = {
        tables: {
          users: {
            columns: {
              id: { type: 'integer', primary_key: true },
              name: { type: 'varchar', size: 100 },
              email: { type: 'varchar', size: 255 }
            },
            generatedColumns: {},
            foreignKeys: {}
          }
        }
      };

      const currentSchema: Record<string, DatabaseTable> = {
        users: {
          name: 'users',
          columns: [
            { name: 'id', type: 'integer', nullable: false, isPrimaryKey: true, isUnique: false },
            { name: 'name', type: 'character varying', nullable: true, isPrimaryKey: false, isUnique: false }
          ],
          foreignKeys: [],
          indexes: [],
          triggers: []
        }
      };

      const diff = engine.generateDiff(desiredSchema, currentSchema);

      expect(diff.tablesToCreate).toHaveLength(0);
      expect(diff.columnsToAdd).toHaveLength(1);
      expect(diff.columnsToAdd[0].tableName).toBe('users');
      expect(diff.columnsToAdd[0].columnName).toBe('email');
      expect(diff.columnsToAdd[0].definition.type).toBe('varchar');
    });

    test('should detect multiple new columns', () => {
      const desiredSchema: ProcessedSchema = {
        tables: {
          users: {
            columns: {
              id: { type: 'integer', primary_key: true },
              email: { type: 'varchar', size: 255 },
              phone: { type: 'varchar', size: 20 },
              active: { type: 'boolean' }
            },
            generatedColumns: {},
            foreignKeys: {}
          }
        }
      };

      const currentSchema: Record<string, DatabaseTable> = {
        users: {
          name: 'users',
          columns: [
            { name: 'id', type: 'integer', nullable: false, isPrimaryKey: true, isUnique: false }
          ],
          foreignKeys: [],
          indexes: [],
          triggers: []
        }
      };

      const diff = engine.generateDiff(desiredSchema, currentSchema);

      expect(diff.columnsToAdd).toHaveLength(3);
      const columnNames = diff.columnsToAdd.map(c => c.columnName);
      expect(columnNames).toContain('email');
      expect(columnNames).toContain('phone');
      expect(columnNames).toContain('active');
    });

    test('should detect new generated FK columns', () => {
      const desiredSchema: ProcessedSchema = {
        tables: {
          posts: {
            columns: {
              id: { type: 'integer', primary_key: true },
              title: { type: 'varchar', size: 200 }
            },
            generatedColumns: {
              user_id: { type: 'integer' },
              category_id: { type: 'integer' }
            },
            foreignKeys: {
              user: { table: 'users' },
              category: { table: 'categories' }
            }
          }
        }
      };

      const currentSchema: Record<string, DatabaseTable> = {
        posts: {
          name: 'posts',
          columns: [
            { name: 'id', type: 'integer', nullable: false, isPrimaryKey: true, isUnique: false },
            { name: 'title', type: 'character varying', nullable: true, isPrimaryKey: false, isUnique: false }
          ],
          foreignKeys: [],
          indexes: [],
          triggers: []
        }
      };

      const diff = engine.generateDiff(desiredSchema, currentSchema);

      expect(diff.columnsToAdd).toHaveLength(2);
      const columnNames = diff.columnsToAdd.map(c => c.columnName);
      expect(columnNames).toContain('user_id');
      expect(columnNames).toContain('category_id');
    });
  });

  describe('Foreign key additions', () => {
    test('should detect new foreign key', () => {
      const desiredSchema: ProcessedSchema = {
        tables: {
          posts: {
            columns: {
              id: { type: 'integer', primary_key: true },
              user_id: { type: 'integer' }
            },
            generatedColumns: {},
            foreignKeys: {
              user: { table: 'users' }
            }
          }
        }
      };

      const currentSchema: Record<string, DatabaseTable> = {
        posts: {
          name: 'posts',
          columns: [
            { name: 'id', type: 'integer', nullable: false, isPrimaryKey: true, isUnique: false },
            { name: 'user_id', type: 'integer', nullable: true, isPrimaryKey: false, isUnique: false }
          ],
          foreignKeys: [],
          indexes: [],
          triggers: []
        }
      };

      const diff = engine.generateDiff(desiredSchema, currentSchema);

      expect(diff.foreignKeysToAdd).toHaveLength(1);
      expect(diff.foreignKeysToAdd[0].tableName).toBe('posts');
      expect(diff.foreignKeysToAdd[0].foreignKeyName).toContain('fk_posts_user');
    });

    test('should not duplicate existing foreign keys', () => {
      const desiredSchema: ProcessedSchema = {
        tables: {
          posts: {
            columns: {
              id: { type: 'integer', primary_key: true },
              user_id: { type: 'integer' }
            },
            generatedColumns: {},
            foreignKeys: {
              user: { table: 'users' }
            }
          }
        }
      };

      const currentSchema: Record<string, DatabaseTable> = {
        posts: {
          name: 'posts',
          columns: [
            { name: 'id', type: 'integer', nullable: false, isPrimaryKey: true, isUnique: false },
            { name: 'user_id', type: 'integer', nullable: true, isPrimaryKey: false, isUnique: false }
          ],
          foreignKeys: [
            {
              name: 'fk_posts_user',
              column: 'user_id',
              referencedTable: 'users',
              referencedColumn: 'id',
              onDelete: 'NO ACTION'
            }
          ],
          indexes: [],
          triggers: []
        }
      };

      const diff = engine.generateDiff(desiredSchema, currentSchema);

      expect(diff.foreignKeysToAdd).toHaveLength(0);
    });
  });

  describe('Trigger recreation', () => {
    test('should mark all tables for trigger recreation', () => {
      const desiredSchema: ProcessedSchema = {
        tables: {
          users: {
            columns: { id: { type: 'integer', primary_key: true } },
            generatedColumns: {},
            foreignKeys: {}
          },
          posts: {
            columns: { id: { type: 'integer', primary_key: true } },
            generatedColumns: {},
            foreignKeys: {}
          }
        }
      };

      const currentSchema: Record<string, DatabaseTable> = {};

      const diff = engine.generateDiff(desiredSchema, currentSchema);

      expect(diff.triggersToRecreate).toHaveLength(2);
      expect(diff.triggersToRecreate).toContain('users');
      expect(diff.triggersToRecreate).toContain('posts');
    });
  });

  describe('No changes scenario', () => {
    test('should return empty diff when schemas match', () => {
      const desiredSchema: ProcessedSchema = {
        tables: {
          users: {
            columns: {
              id: { type: 'integer', primary_key: true },
              name: { type: 'varchar', size: 100 }
            },
            generatedColumns: {},
            foreignKeys: {}
          }
        }
      };

      const currentSchema: Record<string, DatabaseTable> = {
        users: {
          name: 'users',
          columns: [
            { name: 'id', type: 'integer', nullable: false, isPrimaryKey: true, isUnique: false },
            { name: 'name', type: 'character varying', nullable: true, isPrimaryKey: false, isUnique: false }
          ],
          foreignKeys: [],
          indexes: [],
          triggers: []
        }
      };

      const diff = engine.generateDiff(desiredSchema, currentSchema);

      expect(diff.tablesToCreate).toHaveLength(0);
      expect(diff.columnsToAdd).toHaveLength(0);
      expect(diff.foreignKeysToAdd).toHaveLength(0);
      // Triggers are always recreated
      expect(diff.triggersToRecreate).toHaveLength(1);
    });
  });

  describe('Complex scenarios', () => {
    test('should handle mix of new tables and column additions', () => {
      const desiredSchema: ProcessedSchema = {
        tables: {
          users: {
            columns: {
              id: { type: 'integer', primary_key: true },
              name: { type: 'varchar', size: 100 },
              email: { type: 'varchar', size: 255 }
            },
            generatedColumns: {},
            foreignKeys: {}
          },
          posts: {
            columns: {
              id: { type: 'integer', primary_key: true },
              title: { type: 'varchar', size: 200 }
            },
            generatedColumns: {},
            foreignKeys: {}
          }
        }
      };

      const currentSchema: Record<string, DatabaseTable> = {
        users: {
          name: 'users',
          columns: [
            { name: 'id', type: 'integer', nullable: false, isPrimaryKey: true, isUnique: false },
            { name: 'name', type: 'character varying', nullable: true, isPrimaryKey: false, isUnique: false }
          ],
          foreignKeys: [],
          indexes: [],
          triggers: []
        }
      };

      const diff = engine.generateDiff(desiredSchema, currentSchema);

      expect(diff.tablesToCreate).toHaveLength(1);
      expect(diff.tablesToCreate[0].tableName).toBe('posts');
      expect(diff.columnsToAdd).toHaveLength(1);
      expect(diff.columnsToAdd[0].tableName).toBe('users');
      expect(diff.columnsToAdd[0].columnName).toBe('email');
    });
  });

  describe('Idempotency', () => {
    test('should be idempotent - running same diff twice produces same result', () => {
      const desiredSchema: ProcessedSchema = {
        tables: {
          users: {
            columns: {
              id: { type: 'integer', primary_key: true },
              name: { type: 'varchar', size: 100 }
            },
            generatedColumns: {},
            foreignKeys: {}
          }
        }
      };

      const currentSchema: Record<string, DatabaseTable> = {};

      const diff1 = engine.generateDiff(desiredSchema, currentSchema);
      const diff2 = engine.generateDiff(desiredSchema, currentSchema);

      expect(diff1).toEqual(diff2);
    });
  });
});