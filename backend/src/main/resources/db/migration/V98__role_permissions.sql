-- 역할별 메뉴 권한 (RBAC 데이터 모델).
--
-- permissions       : 권한(메뉴/기능 그룹) 카탈로그. code 가 PK. 실제 행은 앱 기동 시
--                     MenuPermissionCatalog 를 기준으로 DataInitializer 가 시드한다(단일 소스).
-- role_permissions  : 역할 ↔ 권한 부여. ADMIN 은 코드로 바이패스하므로 행이 없어도 전권.
--
-- 참고: FK 컬럼에는 인덱스를 직접 만든다(PostgreSQL 은 FK 를 만들어도 자식 컬럼 인덱스를
-- 자동 생성하지 않는다 — CLAUDE.md 7.1).

CREATE TABLE permissions (
    code     varchar(50)  NOT NULL,
    name     varchar(100) NOT NULL,
    category varchar(50)  NOT NULL,
    sort     integer      NOT NULL DEFAULT 0,
    CONSTRAINT permissions_pkey PRIMARY KEY (code)
);

CREATE TABLE role_permissions (
    role_id         bigint      NOT NULL,
    permission_code varchar(50) NOT NULL,
    CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_code),
    CONSTRAINT role_permissions_role_fk
        FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
    CONSTRAINT role_permissions_perm_fk
        FOREIGN KEY (permission_code) REFERENCES permissions (code) ON DELETE CASCADE
);

CREATE INDEX idx_role_permissions_role ON role_permissions (role_id);
CREATE INDEX idx_role_permissions_perm ON role_permissions (permission_code);
