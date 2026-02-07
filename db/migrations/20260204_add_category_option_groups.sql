ALTER TABLE categories ADD COLUMN option_group_label TEXT;
ALTER TABLE categories ADD COLUMN option_group_options_json TEXT;

ALTER TABLE order_items ADD COLUMN option_group_label TEXT;
ALTER TABLE order_items ADD COLUMN option_value TEXT;
