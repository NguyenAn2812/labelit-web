-- =============================================
-- Seed aspects
-- =============================================
insert into label_options (label_type, value, display_order) values
  ('aspect', 'DIGITAL_BANKING', 1),
  ('aspect', 'SERVICE', 2),
  ('aspect', 'FINANCIAL_PRODUCT', 3),
  ('aspect', 'FINANCIAL_FEE', 4),
  ('aspect', 'LEADERSHIP', 5),
  ('aspect', 'MACRO_REGULATION', 6),
  ('aspect', 'MARKET_PERCEPTION', 7);

-- =============================================
-- Seed attributes (linked to parent aspect)
-- =============================================
insert into label_options (label_type, value, parent_value, display_order) values
  -- DIGITAL_BANKING
  ('attribute', 'USABILITY', 'DIGITAL_BANKING', 1),
  ('attribute', 'STABILITY', 'DIGITAL_BANKING', 2),
  ('attribute', 'FEATURES', 'DIGITAL_BANKING', 3),
  ('attribute', 'SECURITY', 'DIGITAL_BANKING', 4),
  -- SERVICE
  ('attribute', 'STAFF_ATTITUDE', 'SERVICE', 1),
  ('attribute', 'SUPPORT_SPEED', 'SERVICE', 2),
  ('attribute', 'PROCEDURE', 'SERVICE', 3),
  -- FINANCIAL_PRODUCT
  ('attribute', 'INTEREST_RATE', 'FINANCIAL_PRODUCT', 1),
  ('attribute', 'LIQUIDITY', 'FINANCIAL_PRODUCT', 2),
  ('attribute', 'PROFITABILITY', 'FINANCIAL_PRODUCT', 3),
  ('attribute', 'OTHER_PRODUCTS', 'FINANCIAL_PRODUCT', 4),
  ('attribute', 'ASSET_QUALITY', 'FINANCIAL_PRODUCT', 5),
  -- FINANCIAL_FEE
  ('attribute', 'TRANSACTION_FEE', 'FINANCIAL_FEE', 1),
  ('attribute', 'TRANSPARENCY', 'FINANCIAL_FEE', 2),
  -- LEADERSHIP
  ('attribute', 'REPUTATION', 'LEADERSHIP', 1),
  ('attribute', 'STRATEGY', 'LEADERSHIP', 2),
  ('attribute', 'INTEGRITY', 'LEADERSHIP', 3),
  ('attribute', 'RISK_CONTROL', 'LEADERSHIP', 4),
  -- MACRO_REGULATION
  ('attribute', 'POLICY_CHANGE', 'MACRO_REGULATION', 1),
  ('attribute', 'MONETARY_CONTROL', 'MACRO_REGULATION', 2),
  ('attribute', 'COMPLIANCE', 'MACRO_REGULATION', 3),
  -- MARKET_PERCEPTION
  ('attribute', 'ANALYST_VIEW', 'MARKET_PERCEPTION', 1),
  ('attribute', 'INVESTOR_SENTIMENT', 'MARKET_PERCEPTION', 2),
  ('attribute', 'MARKET_SIGNAL', 'MARKET_PERCEPTION', 3);

-- =============================================
-- Seed sentiments
-- =============================================
insert into label_options (label_type, value, display_order) values
  ('sentiment', 'POSITIVE', 1),
  ('sentiment', 'NEGATIVE', 2),
  ('sentiment', 'NEUTRAL', 3);
