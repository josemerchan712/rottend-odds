create table users (
    id               uuid primary key,
    email            varchar(254) not null unique,
    display_name     varchar(20)  not null,
    display_name_key varchar(20)  not null unique,
    password_hash    varchar(100) not null,
    created_at       timestamp with time zone not null
);

-- Un único hueco de guardado por usuario. `revision` sube con cada escritura y sirve para
-- detectar conflictos; `verified` = false si el guardado pasa la validación pero es implausible.
create table cloud_saves (
    user_id           uuid primary key references users (id) on delete cascade,
    revision          bigint           not null,
    save_version      integer          not null,
    data              text             not null,
    play_time         double precision not null,
    balance           double precision not null,
    debt_paid         boolean          not null,
    verified          boolean          not null,
    verification_note varchar(255),
    updated_at        timestamp with time zone not null
);

-- Mejor resultado de cada usuario al saldar la deuda de la mesa 1.
create table debt_results (
    user_id           uuid primary key references users (id) on delete cascade,
    play_time_seconds double precision not null,
    verified          boolean          not null,
    created_at        timestamp with time zone not null
);

create index idx_debt_results_ranking on debt_results (verified, play_time_seconds, created_at);
