package com.erp.common;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 메뉴 권한의 단일 소스.
 * <ul>
 *   <li>{@link #ALL} — 권한(메뉴) 카탈로그. 기동 시 DataInitializer 가 이 목록으로 permissions 를 시드한다.</li>
 *   <li>{@link #requiredCode(String)} — API 경로를 관장하는 권한 코드. 인가 인터셉터가 쓴다.</li>
 * </ul>
 *
 * <p><b>권한 세밀도</b>는 "백엔드가 경로로 구분할 수 있는 최소 단위 = API 리소스"에 맞춰 잡았다.
 * 예컨대 판매입력·판매조회·판매현황은 모두 {@code /api/sales} 라 하나의 {@code SALES} 로 묶인다.
 * 프론트 메뉴는 이 코드에 매핑해 노출 여부를 정한다.
 */
public final class MenuPermissionCatalog {

    private MenuPermissionCatalog() {}

    public record Perm(String code, String name, String category, int sort) {}

    /** 카탈로그 (표시 순서 = sort). category 는 상단 대분류와 맞춘다. */
    public static final List<Perm> ALL = List.of(
            // 재고
            new Perm("INV_MASTER",  "품목·창고·기초등록", "재고", 10),
            new Perm("PARTNER",     "거래처·CRM·명함",   "재고", 20),
            new Perm("SALES",       "영업·판매·수주",     "재고", 30),
            new Perm("PURCHASE",    "구매·발주",         "재고", 40),
            new Perm("PRODUCTION",  "생산·외주·BOM",     "재고", 50),
            new Perm("STOCK_MOVE",  "재고이동·조정·현황", "재고", 60),
            new Perm("QUALITY",     "품질·A/S",         "재고", 70),
            new Perm("WMS",         "WMS 로케이션",      "재고", 80),
            new Perm("EXPORT",      "수출관리",          "재고", 90),
            new Perm("MALL",        "쇼핑몰관리",         "재고", 100),
            new Perm("PROFIT",      "이익·원가",         "재고", 110),
            new Perm("PROJECT",     "프로젝트",          "재고", 120),
            // 회계
            new Perm("ACCOUNTING",  "회계전표·장부·전표입력", "회계", 200),
            new Perm("TAX_INVOICE", "전자(세금)계산서",  "회계", 210),
            new Perm("BANK",        "계좌·현금·수표·어음", "회계", 220),
            new Perm("FIXED_ASSET", "고정자산",          "회계", 230),
            new Perm("FINANCE",     "채권채무·예산·자금·계약·수입비용", "회계", 240),
            new Perm("TAX",         "세무(원천·부가·법인)", "회계", 250),
            // 관리
            new Perm("PAYROLL",     "급여·일용근로",      "관리", 300),
            new Perm("HR",          "인사·근태·근로계약", "관리", 310),
            // 그룹웨어
            new Perm("GROUPWARE",   "그룹웨어",          "그룹웨어", 400),
            // 설정
            new Perm("SETTINGS",    "환경설정·기초·공통코드", "설정", 500),
            new Perm("USER_MANAGE", "사용자·권한관리",    "설정", 510)
    );

    /**
     * API base path → 관장 권한 코드. 최장 접두어 우선으로 매칭한다.
     * 여기에 없는 경로는 {@code null}(권한 불요, 인증만) 취급한다.
     */
    private static final Map<String, String> PATH_TO_CODE = buildPathMap();

    private static Map<String, String> buildPathMap() {
        Map<String, String> m = new LinkedHashMap<>();
        // 재고 마스터
        put(m, "INV_MASTER", "/api/items", "/api/item-groups", "/api/warehouses",
                "/api/management-items", "/api/lots");
        put(m, "PARTNER", "/api/partners", "/api/partner-groups", "/api/business-cards",
                "/api/crm-activities");
        put(m, "SALES", "/api/sales", "/api/sales-orders", "/api/quotations", "/api/shipments",
                "/api/price-bulk", "/api/order-types", "/api/order-stages", "/api/price-order-settings",
                "/api/settlements");
        put(m, "PURCHASE", "/api/purchases", "/api/purchase-orders");
        put(m, "PRODUCTION", "/api/productions", "/api/work-orders", "/api/boms", "/api/processes",
                "/api/resources", "/api/production-plans", "/api/work-results", "/api/work-posts",
                "/api/material-issues", "/api/supplies");
        put(m, "STOCK_MOVE", "/api/stock", "/api/stock-transfers", "/api/stock-adjustments");
        put(m, "QUALITY", "/api/quality-inspections", "/api/as-requests");
        put(m, "WMS", "/api/wms");
        put(m, "EXPORT", "/api/exports");
        put(m, "MALL", "/api/mall-orders");
        put(m, "PROFIT", "/api/profit", "/api/costs");
        put(m, "PROJECT", "/api/projects");
        // 회계
        put(m, "ACCOUNTING", "/api/accounting", "/api/accounting-reflection", "/api/journals",
                "/api/vouchers", "/api/accounts", "/api/ledger");
        put(m, "TAX_INVOICE", "/api/tax-invoices");
        put(m, "BANK", "/api/bank-cards", "/api/cash-details", "/api/checks", "/api/non-cash", "/api/notes");
        put(m, "FIXED_ASSET", "/api/fixed-assets");
        put(m, "FINANCE", "/api/budgets", "/api/contracts", "/api/incomes", "/api/expenses");
        put(m, "TAX", "/api/withholding", "/api/other-withholdings", "/api/corporate-tax");
        // 관리
        put(m, "PAYROLL", "/api/payslips", "/api/pay-settings", "/api/daily-works");
        put(m, "HR", "/api/employees", "/api/hr", "/api/attendances", "/api/employment-contracts",
                "/api/departments");
        // 그룹웨어
        put(m, "GROUPWARE", "/api/approvals", "/api/approval-settings", "/api/approval-form-templates",
                "/api/work-journals", "/api/board", "/api/notices", "/api/surveys",
                "/api/drive-documents", "/api/mails", "/api/schedule-events", "/api/field-works");
        // 설정
        put(m, "SETTINGS", "/api/company", "/api/preferences", "/api/security-policy",
                "/api/currencies", "/api/codes", "/api/print-sign-lines");
        put(m, "USER_MANAGE", "/api/users", "/api/roles", "/api/permissions", "/api/companies");
        return m;
    }

    private static void put(Map<String, String> m, String code, String... paths) {
        for (String p : paths) {
            m.put(p, code);
        }
    }

    /**
     * 요청 경로를 관장하는 권한 코드. 매핑이 없으면 {@code null}(권한 불요).
     * {@code /api/auth}, {@code /api/health}, {@code /api/meta}, {@code /api/workspace},
     * {@code /api/me} 등 공통/참조 경로는 매핑하지 않아 인증만 되면 통과한다.
     */
    public static String requiredCode(String path) {
        String best = null;
        String bestCode = null;
        for (Map.Entry<String, String> e : PATH_TO_CODE.entrySet()) {
            String base = e.getKey();
            if (path.equals(base) || path.startsWith(base + "/")) {
                if (best == null || base.length() > best.length()) {
                    best = base;
                    bestCode = e.getValue();
                }
            }
        }
        return bestCode;
    }
}
