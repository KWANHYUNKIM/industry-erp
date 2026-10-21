package com.erp.hr.dailypayitem;

import com.erp.common.ApiException;
import com.erp.hr.dailypayitem.dto.DailyPayItemDtos.DailyPayItemRequest;
import com.erp.hr.dailypayitem.dto.DailyPayItemDtos.DailyPayItemResponse;
import com.erp.hr.dailypayitem.dto.DailyPayItemDtos.FormulaRequest;
import com.erp.hr.dailypayitem.dto.DailyPayItemDtos.FormulaResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 일용근로 수당등록(E020136) · 공제등록(E020137). 2026-10-20 원본 실측:
 * 코드 · 이름 · 표시순서를 넣고 [저장(F8)] → 안내 없이 저장, 수당은 지급유형 '변동(일)' · 과세구분 '전액과세' 가 기본,
 * 코드는 저장 뒤 막힘, 이름을 고치면 계산식이 따라 바뀜, [사용중단/재사용 ▾] 삭제 → '삭제하겠습니까?'.
 */
@Service
@RequiredArgsConstructor
public class DailyPayItemService {

    private final DailyPayItemRepository repository;
    private final DailyPayItemFormulaRepository formulaRepository;

    /** 원본 계산식리스트의 기본 줄 적용시점(2026-10-21 실측 '2010/01 ~'). */
    public static final String BASE_MONTH = "2010-01";

    @Transactional(readOnly = true)
    public List<DailyPayItemResponse> findAll(DailyPayItemKind kind, boolean includeInactive) {
        return repository.findByKindOrderBySortOrderAscCodeAsc(kind).stream()
                .filter(i -> includeInactive || i.isActive())
                .map(i -> DailyPayItemResponse.from(i, formulaRepository.findByItemIdOrderByApplyMonthDesc(i.getId()).stream()
                        .findFirst().map(DailyPayItemFormula::getFormula).orElse(null))).toList();
    }

    @Transactional
    public DailyPayItemResponse create(DailyPayItemRequest req) {
        if (req.code() == null || req.code().isBlank()) throw ApiException.badRequest("데이터를 입력하기 바랍니다.");
        String code = req.code().trim();
        if (repository.existsByKindAndCode(req.kind(), code)) {
            throw ApiException.conflict("이미 등록된 코드입니다: " + code);
        }
        DailyPayItem i = DailyPayItem.builder().kind(req.kind()).code(code).build();
        if (req.kind() == DailyPayItemKind.ALLOWANCE) {
            i.setPayMethod("변동(일)");
            i.setTaxType("전액과세");
        }
        apply(i, req);
        return DailyPayItemResponse.from(repository.save(i));
    }

    @Transactional
    public DailyPayItemResponse update(Long id, DailyPayItemRequest req) {
        DailyPayItem i = get(id);
        if (i.isBuiltin() && !i.getName().equals(req.name().trim())) {
            throw ApiException.badRequest("기본 항목의 이름은 바꿀 수 없습니다: " + i.getName());
        }
        apply(i, req);
        if (req.active() != null) i.setActive(req.active());
        return DailyPayItemResponse.from(i);
    }

    @Transactional
    public void delete(Long id) {
        DailyPayItem i = get(id);
        if (i.isBuiltin()) throw ApiException.conflict("급여계산에 쓰는 기본 항목은 삭제할 수 없습니다: " + i.getName());
        repository.delete(i);
        try {
            repository.flush();   // 근무입력 · 근무기록확정 · 급여대장에 쓰인 항목은 FK 가 막는다(사원 급여지급사항 칸은 함께 지워짐)
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            throw ApiException.conflict("근무입력 · 급여대장에 쓰인 항목은 삭제할 수 없습니다: " + i.getName());
        }
    }

    private void apply(DailyPayItem i, DailyPayItemRequest req) {
        i.setName(req.name().trim());
        i.setSortOrder(req.sortOrder());
        if (i.getKind() == DailyPayItemKind.ALLOWANCE) {
            if (req.payMethod() != null && !req.payMethod().isBlank()) i.setPayMethod(req.payMethod().trim());
            if (req.taxType() != null && !req.taxType().isBlank()) i.setTaxType(req.taxType().trim());
            i.setRate(req.rate());
        }
    }

    private DailyPayItem get(Long id) {
        return repository.findById(id).orElseThrow(() -> ApiException.notFound("항목을 찾을 수 없습니다."));
    }

    // ── 계산식리스트(원본 [설정] → '계산식리스트' 창, 2026-10-21 실측) ────────────────────────────────────

    /** 적용시점 늦은 것부터. 끝에 기본 '2010/01 ~' 줄(자동 계산식) — 2010/01 을 직접 등록했으면 그 줄이 대신한다. */
    @Transactional(readOnly = true)
    public List<FormulaResponse> formulas(Long itemId) {
        DailyPayItem i = get(itemId);
        List<FormulaResponse> out = new ArrayList<>(formulaRepository.findByItemIdOrderByApplyMonthDesc(itemId).stream()
                .map(f -> new FormulaResponse(f.getId(), f.getApplyMonth(), f.getFormula())).toList());
        if (out.stream().noneMatch(f -> BASE_MONTH.equals(f.applyMonth()))) out.add(new FormulaResponse(null, BASE_MONTH, i.formula()));
        return out;
    }

    @Transactional
    public FormulaResponse createFormula(Long itemId, FormulaRequest req) {
        DailyPayItem i = get(itemId);
        String month = month(req.applyMonth());
        String formula = checked(req.formula());
        if (formulaRepository.findByItemIdAndApplyMonth(itemId, month).isPresent()) {
            throw ApiException.conflict("이미 등록된 적용시점입니다: " + month.replace('-', '/'));
        }
        DailyPayItemFormula f = formulaRepository.save(DailyPayItemFormula.builder().item(i).applyMonth(month).formula(formula).build());
        return new FormulaResponse(f.getId(), f.getApplyMonth(), f.getFormula());
    }

    @Transactional
    public FormulaResponse updateFormula(Long itemId, Long formulaId, FormulaRequest req) {
        DailyPayItemFormula f = formula(itemId, formulaId);
        String month = month(req.applyMonth());
        formulaRepository.findByItemIdAndApplyMonth(itemId, month).filter(o -> !o.getId().equals(formulaId)).ifPresent(o -> {
            throw ApiException.conflict("이미 등록된 적용시점입니다: " + month.replace('-', '/'));
        });
        f.setApplyMonth(month);
        f.setFormula(checked(req.formula()));
        return new FormulaResponse(f.getId(), f.getApplyMonth(), f.getFormula());
    }

    /** 원본 계산식등록 [사용중단/재사용 ▾] 삭제 — 확인 창 없이 지우고 창이 닫힌다. */
    @Transactional
    public void deleteFormula(Long itemId, Long formulaId) {
        formulaRepository.delete(formula(itemId, formulaId));
    }

    /** 귀속연월(yyyy-MM)에 쓸 직접 등록한 계산식 — 없으면 빈 값(기본 자동 계산식으로 셈). */
    @Transactional(readOnly = true)
    public Optional<String> customFormula(Long itemId, String payMonth) {
        return formulaRepository.findFirstByItemIdAndApplyMonthLessThanEqualOrderByApplyMonthDesc(itemId, payMonth)
                .map(DailyPayItemFormula::getFormula);
    }

    /** 계산식에 쓰는 항목 글자 → 값(원본 계산식등록 오른쪽 '찾기(F3)' 목록). 값이 없으면 0. */
    public static Map<String, BigDecimal> variables(List<DailyPayItem> allowances, Map<Long, BigDecimal> payAmount,
                                                    Map<Long, BigDecimal> confirmQty, BigDecimal wage, BigDecimal days,
                                                    BigDecimal confirmAmount, BigDecimal rate) {
        Map<String, BigDecimal> v = new HashMap<>();
        v.put("일급(급여지급사항)", wage);
        v.put("일급(근무기록확정)", days);
        v.put("비과세총액(급여지급사항)", BigDecimal.ZERO);
        v.put("근무기록확정(금액)", confirmAmount);
        v.put("배율(수당항목)", rate != null ? rate : BigDecimal.ONE);
        v.put("숫자형추가항목2(수당항목)", BigDecimal.ZERO);
        v.put("숫자형추가항목3(수당항목)", BigDecimal.ZERO);
        for (DailyPayItem a : allowances) {
            boolean day = a.isBuiltin() && "일근무".equals(a.getName());
            v.put(a.getName() + "(급여지급사항)", day ? wage : payAmount.getOrDefault(a.getId(), BigDecimal.ZERO));
            v.put(a.getName() + "(근무기록확정)", day ? days : confirmQty.getOrDefault(a.getId(), BigDecimal.ZERO));
        }
        return v;
    }

    /** 저장 전에 0 으로 한 번 셈해 본다 — 모르는 항목 · 괄호가 어긋난 식은 저장하지 않는다. */
    private String checked(String formula) {
        String f = formula.trim();
        List<DailyPayItem> all = new ArrayList<>(repository.findByKindOrderBySortOrderAscCodeAsc(DailyPayItemKind.ALLOWANCE));
        all.addAll(repository.findByKindOrderBySortOrderAscCodeAsc(DailyPayItemKind.DEDUCTION));
        try {
            DailyPayFormula.evaluate(f, variables(all, Map.of(), Map.of(), BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ONE));
        } catch (RuntimeException e) {
            throw ApiException.badRequest(e.getMessage() != null ? e.getMessage() : "계산식이 올바르지 않습니다.");
        }
        return f;
    }

    private static String month(String raw) {
        String m = raw.trim().replace('/', '-');
        if (!m.matches("\\d{4}-(0[1-9]|1[0-2])")) throw ApiException.badRequest("적용시점이 올바르지 않습니다: " + raw);
        return m;
    }

    private DailyPayItemFormula formula(Long itemId, Long formulaId) {
        DailyPayItemFormula f = formulaRepository.findById(formulaId)
                .orElseThrow(() -> ApiException.notFound("계산식을 찾을 수 없습니다."));
        if (!f.getItem().getId().equals(itemId)) throw ApiException.notFound("계산식을 찾을 수 없습니다.");
        return f;
    }
}
