SELECT tax_rates_match_best('CA', 25000) AS rate_low,
       tax_rates_match_best('CA', 75000) AS rate_high,
       tax_rates_match_best('NY', 50000) AS rate_ny;
