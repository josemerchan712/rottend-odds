-- Cuentas sin email (sesión 11): el nombre de jugador es el identificador de login y el nombre público
-- del ranking. Se guarda como lo escribió el jugador (player_name) y es único sin distinguir mayúsculas por
-- su forma normalizada (player_name_key, en minúsculas). Sin email no hay recuperación por correo: el código
-- de recuperación se muestra una vez al registrarse y aquí solo queda su hash BCrypt.
--
-- Esta V1 se reescribió en la sesión 11 en vez de añadir una V2: el backend nunca se había desplegado ni
-- aplicado a una base real (solo H2 en los tests). Si alguien tiene un volumen local de antes, Flyway avisará
-- de que la V1 no coincide: basta con `docker compose down -v`.
create table users (
    id                 uuid primary key,
    player_name        varchar(20)  not null,
    player_name_key    varchar(20)  not null,
    password_hash      varchar(100) not null,
    recovery_code_hash varchar(100) not null,
    created_at         timestamp with time zone not null,
    constraint uq_users_player_name_key unique (player_name_key)
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
