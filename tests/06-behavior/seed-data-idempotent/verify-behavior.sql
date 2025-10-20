SELECT code, name, symbol, COUNT(*) as count
FROM currencies
GROUP BY code, name, symbol
ORDER BY code;
