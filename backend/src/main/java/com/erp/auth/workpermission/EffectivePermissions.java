package com.erp.auth.workpermission;

import com.erp.common.MenuPermissionCatalog;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * 한 사용자가 지금 가진 업무권한 — 기본권한 · 권한그룹 · 개별권한을 풀어 업무마다 하나로 만든 값.
 * 인증 때 한 번 만들어 {@code UserPrincipal} 이 들고, 인가 인터셉터와 {@code /api/me/permissions} 가 읽는다.
 */
public final class EffectivePermissions {

    /** 업무 하나의 풀린 권한. {@code menus} 는 예외(메뉴) — 화면 경로 → 진입 여부. */
    public record Access(WorkPermissionMode mode, boolean create, boolean update, boolean delete, boolean export,
                         Map<String, Boolean> menus) {
        public static final Access ALL = new Access(WorkPermissionMode.ALLOW, true, true, true, true, Map.of());
        public static final Access NONE = new Access(WorkPermissionMode.DENY, false, false, false, false, Map.of());

        public boolean canEnter(String menuPath) {
            if (mode == WorkPermissionMode.DENY) return false;
            return menuPath == null || !Boolean.FALSE.equals(menus.get(menuPath));
        }

        public boolean can(WorkAction action) {
            if (mode == WorkPermissionMode.DENY) return false;
            return switch (action) {
                case VIEW -> true;
                case CREATE -> create;
                case UPDATE -> update;
                case DELETE -> delete;
                case EXPORT -> export;
            };
        }

        static Access of(WorkPermission w) {
            if (w.getMode() == WorkPermissionMode.DENY) return NONE;
            return new Access(w.getMode(), w.isCanCreate(), w.isCanUpdate(), w.isCanDelete(), w.isCanExport(),
                    parseMenus(w.getMenuRules()));
        }
    }

    private final boolean master;
    private final Map<String, Access> works;

    EffectivePermissions(boolean master, Map<String, Access> works) {
        this.master = master;
        this.works = Collections.unmodifiableMap(works);
    }

    /** 마스터 — 모든 업무 모든 행위. */
    public static EffectivePermissions master() {
        Map<String, Access> all = new LinkedHashMap<>();
        for (MenuPermissionCatalog.Perm p : MenuPermissionCatalog.ALL) all.put(p.code(), Access.ALL);
        return new EffectivePermissions(true, all);
    }

    /** 아무 권한도 없음(사용자를 못 풀었을 때의 안전한 기본값). */
    public static EffectivePermissions none() {
        return new EffectivePermissions(false, Map.of());
    }

    public boolean isMaster() {
        return master;
    }

    public Access access(String code) {
        if (master) return Access.ALL;
        return works.getOrDefault(code, Access.NONE);
    }

    /** 업무(와 그 업무의 하위 화면 menuPath, 모르면 null)에 들어갈 수 있나. */
    public boolean canEnter(String code, String menuPath) {
        return master || access(code).canEnter(menuPath);
    }

    public boolean can(String code, WorkAction action) {
        return master || access(code).can(action);
    }

    /** 진입할 수 있는 업무 코드(권한없음이 아닌 것). 옛 '권한 코드 목록' 자리. */
    public Set<String> allowedCodes() {
        Set<String> s = new LinkedHashSet<>();
        for (MenuPermissionCatalog.Perm p : MenuPermissionCatalog.ALL) {
            if (master || access(p.code()).mode() != WorkPermissionMode.DENY) s.add(p.code());
        }
        return s;
    }

    public Map<String, Access> works() {
        if (!master) return works;
        Map<String, Access> all = new LinkedHashMap<>();
        for (MenuPermissionCatalog.Perm p : MenuPermissionCatalog.ALL) all.put(p.code(), Access.ALL);
        return all;
    }

    /** {@code /sales/list=N} 줄들 → 경로 → 진입 여부. */
    public static Map<String, Boolean> parseMenus(String rules) {
        if (rules == null || rules.isBlank()) return Map.of();
        Map<String, Boolean> m = new LinkedHashMap<>();
        for (String line : rules.split("\\R")) {
            int eq = line.lastIndexOf('=');
            if (eq <= 0) continue;
            m.put(line.substring(0, eq).trim(), "Y".equalsIgnoreCase(line.substring(eq + 1).trim()));
        }
        return m;
    }

    public static String formatMenus(Map<String, Boolean> menus) {
        if (menus == null || menus.isEmpty()) return null;
        StringBuilder sb = new StringBuilder();
        menus.forEach((k, v) -> {
            if (k == null || k.isBlank() || v == null) return;
            if (!sb.isEmpty()) sb.append('\n');
            sb.append(k.trim()).append('=').append(v ? 'Y' : 'N');
        });
        return sb.isEmpty() ? null : sb.toString();
    }
}
