create table if not exists users (
  id text primary key default (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    '4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  ),
  username text not null unique,
  password_hash text not null,
  display_name text,
  role text not null check (role in ('admin', 'operator', 'customer')),
  can_balance_check boolean not null default false,
  can_view_balance boolean not null default false,
  is_active boolean not null default true,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create table if not exists user_sessions (
  id text primary key default (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    '4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  ),
  user_id text not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at text not null,
  revoked_at text,
  created_at text not null default current_timestamp
);

create table if not exists cards (
  id text primary key default (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    '4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  ),
  provider text not null check (provider in ('clover', 'paypal', 'fluidpay', 'globalpayments', 'propelrpay')),
  provider_customer_id text,
  provider_payment_token text not null,
  masked_pan text not null,
  first6 varchar(6),
  last4 varchar(4) not null,
  brand text,
  exp_month varchar(2) not null,
  exp_year varchar(4) not null,
  cardholder_name text,
  billing_address_line1 text,
  billing_address_line2 text,
  billing_city text,
  billing_state text,
  billing_zip text,
  billing_country text,
  auth_check_limit numeric(12, 2),
  is_enrolled boolean not null default false,
  verification_status text not null default 'pending',
  avs_result text,
  auth_result_code text,
  provider_reference_id text,
  notes text,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create unique index if not exists cards_provider_token_uidx
  on cards (provider, provider_payment_token);

create table if not exists enrollment_profiles (
  id text primary key default (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    '4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  ),
  card_id text not null unique references cards(id) on delete cascade,
  enroll_bank_url text not null,
  username_encrypted text,
  password_encrypted text,
  holder_ssn_last4 varchar(4),
  holder_ssn_encrypted text,
  holder_dob_encrypted text,
  free_text_encrypted text,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create table if not exists verification_attempts (
  id text primary key default (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    '4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  ),
  card_id text not null references cards(id) on delete cascade,
  provider text not null check (provider in ('clover', 'paypal', 'fluidpay', 'globalpayments', 'propelrpay')),
  attempt_type text not null check (attempt_type in ('live_check', 'bin_check', 'balance_check', 'auth_check', 'sale_check', 'capture', 'refund', 'void', 'iframe_verify')),
  status text not null,
  amount numeric(12, 2),
  currency varchar(3),
  provider_reference_id text,
  raw_response text,
  balance_amount numeric(12, 2),
  created_by_user_id text references users(id) on delete set null,
  created_at text not null default current_timestamp
);

create table if not exists card_phone_numbers (
  id text primary key default (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    '4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  ),
  card_id text not null references cards(id) on delete cascade,
  phone_number text not null,
  masked_number text,
  verification_code text,
  is_verified boolean not null default false,
  added_by text,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create index if not exists card_phone_numbers_card_id_idx
  on card_phone_numbers (card_id);

create table if not exists audit_logs (
  id text primary key default (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    '4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6)))
  ),
  entity_type text not null,
  entity_id text,
  action text not null,
  status text not null,
  actor_user_id text references users(id) on delete set null,
  details text,
  created_at text not null default current_timestamp
);

create index if not exists audit_logs_entity_idx
  on audit_logs (entity_type, entity_id, created_at);
