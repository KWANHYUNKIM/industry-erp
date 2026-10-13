package com.erp.hr.payroll;

import com.erp.common.ApiException;
import com.erp.hr.payroll.dto.PaySettingDtos.FormulaRequest;
import com.erp.hr.payroll.dto.PaySettingDtos.FormulaResponse;
import com.erp.hr.payroll.dto.PaySettingDtos.FormulaVariableGroup;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 원본 수당항목등록 [계산식] — 계산식리스트(적용시점 · 계산식, 신규 · 사용중단/재사용)와 계산식등록(찾기 목록의 항목).
 * 급여계산은 {@link #formulasFor(String)} 로 귀속월에 걸리는 식을 받아 {@link PayFormula} 로 푼다.
 */
@Service
@RequiredArgsConstructor
public class PayFormulaService {

    /** 기타설정(사원) — 원본 찾기 목록 차례(2026-10-13 실측). 숫자형추가항목은 우리 사원에 없어 뺐다. */
    public static final List<String> SETTING_VARIABLES = List.of(
            "건강보험보수월액(기타설정(사원))", "국민연금기준소득월액(기타설정(사원))", "고용보험보수총액(기타설정(사원))",
            "배우자(기타설정(사원))", "공제대상가족수(기타설정(사원))", "20세이하 자녀수(기타설정(사원))",
            "간이세액표적용방법(기타설정(사원))");
    public static final String FAMILY_COUNT = "간이세액표 적용 부양가족수(계산항목)";

    private final PayItemFormulaRepository formulaRepository;
    private final PayItemRepository itemRepository;

    @Transactional(readOnly = true)
    public List<FormulaResponse> findAll() {
        return formulaRepository.findAllWithItem().stream().map(FormulaResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<FormulaVariableGroup> variables() {
        List<PayItem> allowances = allowanceItems();
        List<FormulaVariableGroup> out = new ArrayList<>();
        List<String> pay = new ArrayList<>();
        pay.add("기본급(급여지급사항)");
        allowances.forEach(i -> pay.add(i.getName() + "(급여지급사항)"));
        out.add(new FormulaVariableGroup("급여지급사항", pay));
        out.add(new FormulaVariableGroup("기타설정(사원)", SETTING_VARIABLES));
        out.add(new FormulaVariableGroup("근무기록확정", allowances.stream()
                .filter(i -> i.getPayMethod() == PayMethod.HOURLY || i.getPayMethod() == PayMethod.DAILY)
                .map(i -> i.getName() + "(근무기록확정)").toList()));
        List<String> amounts = new ArrayList<>();
        amounts.add("기본급(수당)");
        allowances.forEach(i -> amounts.add(i.getName() + "(수당)"));
        out.add(new FormulaVariableGroup("수당", amounts));
        out.add(new FormulaVariableGroup("계산항목", List.of(FAMILY_COUNT)));
        return out;
    }

    private List<PayItem> allowanceItems() {
        return itemRepository.findAll().stream()
                .filter(i -> i.getKind() == com.erp.hr.payroll.PayslipLineKind.ALLOWANCE && !"기본급".equals(i.getName()))
                .sorted(java.util.Comparator.comparingInt(PayItem::getSortOrder).thenComparing(PayItem::getId))
                .toList();
    }

    @Transactional
    public FormulaResponse create(Long itemId, FormulaRequest req) {
        PayItem item = itemRepository.findById(itemId)
                .orElseThrow(() -> ApiException.notFound("수당항목을 찾을 수 없습니다. id=" + itemId));
        String from = month(req.effectiveFrom());
        validate(req.formula());
        formulaRepository.findByPayItemIdAndEffectiveFrom(itemId, from).ifPresent(f -> {
            throw ApiException.badRequest("같은 적용시점의 계산식이 있습니다. 적용시점=" + from.replace('-', '/'));
        });
        return FormulaResponse.from(formulaRepository.save(PayItemFormula.builder()
                .payItem(item).effectiveFrom(from).formula(req.formula().trim()).build()));
    }

    @Transactional
    public FormulaResponse update(Long id, FormulaRequest req) {
        PayItemFormula f = get(id);
        String from = month(req.effectiveFrom());
        validate(req.formula());
        formulaRepository.findByPayItemIdAndEffectiveFrom(f.getPayItem().getId(), from)
                .filter(o -> !o.getId().equals(id)).ifPresent(o -> {
                    throw ApiException.badRequest("같은 적용시점의 계산식이 있습니다. 적용시점=" + from.replace('-', '/'));
                });
        f.setEffectiveFrom(from);
        f.setFormula(req.formula().trim());
        return FormulaResponse.from(f);
    }

    /** 원본 [사용중단/재사용] — 고른 줄의 사용 여부를 뒤집는다. */
    @Transactional
    public FormulaResponse toggleActive(Long id) {
        PayItemFormula f = get(id);
        f.setActive(!f.isActive());
        return FormulaResponse.from(f);
    }

    /** 급여계산용 — 항목 id → 귀속월(YYYY-MM)에 걸리는 가장 늦은 적용시점의 사용 중인 식. */
    @Transactional(readOnly = true)
    public Map<Long, String> formulasFor(String payMonth) {
        Map<Long, String> out = new LinkedHashMap<>();
        for (PayItemFormula f : formulaRepository.findAllWithItem()) {   // 적용시점 내림차순
            if (!f.isActive() || f.getEffectiveFrom().compareTo(payMonth) > 0) continue;
            out.putIfAbsent(f.getPayItem().getId(), f.getFormula());
        }
        return out;
    }

    private void validate(String formula) {
        List<String> names = variables().stream().flatMap(g -> g.names().stream()).toList();
        try {
            PayFormula.validate(formula, names);
        } catch (IllegalArgumentException | ArithmeticException e) {
            throw ApiException.badRequest(PayFormula.INVALID);
        }
    }

    private static String month(String v) {
        if (v == null || !v.matches("\\d{4}-(0[1-9]|1[0-2])")) throw ApiException.badRequest("적용시점을 입력 바랍니다.");
        return v;
    }

    private PayItemFormula get(Long id) {
        return formulaRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("계산식을 찾을 수 없습니다. id=" + id));
    }
}
