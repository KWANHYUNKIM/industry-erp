package com.erp.hr.payroll;

import com.erp.common.ApiException;
import com.erp.hr.payroll.dto.PaySettingDtos.GroupLineInput;
import com.erp.hr.payroll.dto.PaySettingDtos.PayGroupRequest;
import com.erp.hr.payroll.dto.PaySettingDtos.PayGroupResponse;
import com.erp.hr.payroll.dto.PaySettingDtos.PayItemRequest;
import com.erp.hr.payroll.dto.PaySettingDtos.PayItemResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import com.erp.hr.payroll.dto.PaySettingDtos;

/**
 * 관리 > 급여 설정 — 수당·공제 항목과 그룹.
 * 그룹을 급여계산에 적용하면 항목들이 명세 라인으로 들어간다(PayrollService).
 */
@Service
@RequiredArgsConstructor
public class PaySettingService {

    private final PayItemRepository itemRepository;
    private final PayGroupRepository groupRepository;
    private final PayGroupEmployeeRepository groupEmployeeRepository;
    private final com.erp.hr.employee.EmployeeService employeeService;
    private final com.erp.common.DocumentNoGenerator documentNoGenerator;
    private final EmployeePayItemRepository employeePayItemRepository;
    private final EmployeePayrollSettingRepository payrollSettingRepository;
    private final PayItemFormulaRepository formulaRepository;
    private final com.erp.common.history.ChangeHistoryService changeHistory;

    /**
     * 수당리스트 · 공제리스트 하단 [H] — 원본은 줄마다가 아니라 <b>리스트 전체</b>를 마지막으로 저장한 때 · 사람 한 줄
     * ('2024/10/21 오후 3:26:09 [ECMASTER]', 2026-10-14 loginaa E090103 · E090114 실측). 리스트 하나를 id 0 으로 둔다.
     */
    public static final String HISTORY_ALLOWANCES = "ALLOWANCE_ITEMS";
    public static final String HISTORY_DEDUCTIONS = "DEDUCTION_ITEMS";

    private void recordList(PayslipLineKind kind, String action) {
        changeHistory.record(kind == PayslipLineKind.DEDUCTION ? HISTORY_DEDUCTIONS : HISTORY_ALLOWANCES, 0L, action);
    }

    // ── 항목 ──────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<PayItemResponse> findItems() {
        return itemRepository.findAllByOrderByKindAscSortOrderAscCodeAsc().stream().map(PayItemResponse::from).toList();
    }

    @Transactional
    public PayItemResponse createItem(PayItemRequest req) {
        String code = req.code().trim().toUpperCase();
        if (itemRepository.existsByCode(code)) {
            throw ApiException.conflict("이미 등록된 항목코드입니다: " + code);
        }
        PayItem i = PayItem.builder()
                .code(code)
                .name(req.name())
                .kind(req.kind())
                // 공제 항목에는 과세 개념이 없다. 항상 true 로 두고 계산에서 쓰지 않는다.
                .taxable(req.kind() == PayslipLineKind.DEDUCTION || req.taxable() == null || req.taxable())
                .defaultAmount(req.defaultAmount() != null ? req.defaultAmount() : BigDecimal.ZERO)
                .active(req.active() == null || req.active())
                .build();
        applyListFields(i, req);
        PayItem saved = itemRepository.save(i);
        formulaRepository.save(PayItemFormula.builder()
                .payItem(saved).effectiveFrom(DEFAULT_FORMULA_FROM).formula(defaultFormula(saved)).build());
        recordList(saved.getKind(), com.erp.common.history.ChangeHistoryService.CREATED);
        return PayItemResponse.from(saved);
    }

    /** 원본은 새 항목을 저장하면 계산식리스트에 '2010/01 ~' 한 줄을 스스로 단다(2026-10-13 수당 · 공제 둘 다 실측). */
    static final String DEFAULT_FORMULA_FROM = "2010-01";

    /** 원본 새 항목의 계산식 — 고정은 R( 이름(급여지급사항) , 0 ), 변동(일 · 시간)은 근무기록확정을 곱한다(원본 야근수당 식과 같은 꼴). */
    static String defaultFormula(PayItem item) {
        String n = item.getName().trim();
        boolean worked = item.getKind() == PayslipLineKind.ALLOWANCE
                && (item.getPayMethod() == PayMethod.HOURLY || item.getPayMethod() == PayMethod.DAILY);
        return worked ? "R( " + n + "(급여지급사항) * " + n + "(근무기록확정) , 0 )" : "R( " + n + "(급여지급사항) , 0 )";
    }

    @Transactional
    public PayItemResponse updateItem(Long id, PayItemRequest req) {
        PayItem i = item(id);
        // 항목코드는 바꾸지 않는다. 그룹이 이 항목을 가리키고 있다.
        i.setName(req.name());
        i.setKind(req.kind());
        i.setTaxable(req.kind() == PayslipLineKind.DEDUCTION || req.taxable() == null || req.taxable());
        i.setDefaultAmount(req.defaultAmount() != null ? req.defaultAmount() : i.getDefaultAmount());
        i.setActive(req.active() == null || req.active());
        applyListFields(i, req);
        recordList(i.getKind(), com.erp.common.history.ChangeHistoryService.UPDATED);
        return PayItemResponse.from(i);
    }

    /**
     * 원본 수당리스트의 칸들. <b>[비과세유형]을 주면 과세 여부가 그것을 따른다</b> — 전액과세가 아니면
     * 비과세다. 두 값을 따로 두면 "식대인데 과세" 같은 항목이 생겨 급여계산의 과세소득이 틀어진다.
     */
    private void applyListFields(PayItem i, PayItemRequest req) {
        if (req.sortOrder() != null) i.setSortOrder(req.sortOrder());
        i.setRate(req.rate());
        if (req.payMethod() != null) i.setPayMethod(req.payMethod());
        i.setCalcNote(req.calcNote());
        if (req.taxFreeType() != null && i.getKind() == PayslipLineKind.ALLOWANCE) {
            i.setTaxFreeType(req.taxFreeType());
            i.setTaxable(req.taxFreeType() == PayTaxFreeType.NONE);
        } else if (i.isTaxable()) {
            // 과세로만 고친 요청(급여 설정 화면) — 비과세유형도 전액과세로 맞춘다
            i.setTaxFreeType(PayTaxFreeType.NONE);
        }
    }

    // ── 그룹 ──────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<PayGroupResponse> findGroups() {
        java.util.Map<Long, Long> counts = new java.util.HashMap<>();
        for (Object[] r : groupEmployeeRepository.countByGroup()) counts.put((Long) r[0], (Long) r[1]);
        return groupRepository.findAllWithLines().stream()
                .map(g -> PayGroupResponse.from(g, counts.getOrDefault(g.getId(), 0L))).toList();
    }

    @Transactional
    public PayGroupResponse createGroup(PayGroupRequest req) {
        if (groupRepository.existsByName(req.name())) {
            throw ApiException.conflict("이미 등록된 그룹입니다: " + req.name());
        }
        String code = req.code() == null || req.code().isBlank()
                ? documentNoGenerator.nextMasterCode("", "pay_groups", "code", 5)
                : req.code().trim();
        if (groupRepository.existsByCode(code)) {
            throw ApiException.conflict("이미 등록된 그룹코드입니다: " + code);
        }
        PayGroup g = PayGroup.builder()
                .code(code)
                .name(req.name())
                .remark(req.remark())
                .active(req.active() == null || req.active())
                .build();
        applyLines(g, req.lines());
        return PayGroupResponse.from(groupRepository.save(g));
    }

    @Transactional
    public PayGroupResponse updateGroup(Long id, PayGroupRequest req) {
        PayGroup g = group(id);
        if (!g.getName().equals(req.name()) && groupRepository.existsByName(req.name())) {
            throw ApiException.conflict("이미 등록된 그룹입니다: " + req.name());
        }
        g.setName(req.name());
        g.setRemark(req.remark());
        g.setActive(req.active() == null || req.active());

        // 라인을 지우고 다시 넣는다. flush 를 끼우지 않으면 삭제보다 삽입이 먼저 나가
        // (group_id, pay_item_id) 유니크 제약에 걸린다.
        g.clearLines();
        groupRepository.flush();
        applyLines(g, req.lines());
        return PayGroupResponse.from(g);
    }

    @Transactional
    public void deleteGroup(Long id) {
        // 원본 [삭제]: '한번 지워진 자료는 복구될 수 없습니다.' — 적용사원이 남아 있으면 지우지 않는다
        // (2026-10-20 관리2 실측: '해당 항목을 사용 중인 자료가 있어 삭제할 수 없습니다. 자료를 먼저 삭제 바랍니다.'
        //  적용사원등록 창의 [삭제]로 사원을 먼저 빼야 그룹이 지워진다)
        PayGroup g = group(id);
        if (!groupEmployeeRepository.findByGroupWithEmployee(id).isEmpty()) {
            throw ApiException.conflict("해당 항목을 사용 중인 자료가 있어 삭제할 수 없습니다. 자료를 먼저 삭제 바랍니다.");
        }
        groupRepository.delete(g);
    }

    /** 원본 [적용사원등록] 창이 여는 목록. */
    @Transactional(readOnly = true)
    public List<PaySettingDtos.GroupEmployeeResponse> findGroupEmployees(Long groupId) {
        group(groupId);
        return groupEmployeeRepository.findByGroupWithEmployee(groupId).stream()
                .map(PaySettingDtos.GroupEmployeeResponse::from).toList();
    }

    /**
     * 원본 [적용사원등록] 저장 — 이 그룹의 적용사원을 통째로 바꾼다.
     * 사원은 그룹 하나에만 들므로, 다른 그룹에 있던 사원은 그쪽에서 빠지고 이쪽으로 온다.
     */
    @Transactional
    public List<PaySettingDtos.GroupEmployeeResponse> replaceGroupEmployees(
            Long groupId, List<PaySettingDtos.GroupEmployeeInput> inputs) {
        PayGroup g = group(groupId);
        Set<Long> seen = new HashSet<>();
        for (var in : inputs) {
            if (!seen.add(in.employeeId())) throw ApiException.badRequest("같은 사원을 두 번 넣을 수 없습니다.");
        }
        groupEmployeeRepository.deleteByGroup_Id(groupId);
        if (!seen.isEmpty()) groupEmployeeRepository.deleteByEmployee_IdIn(List.copyOf(seen));
        groupEmployeeRepository.flush();
        for (var in : inputs) {
            groupEmployeeRepository.save(PayGroupEmployee.builder()
                    .group(g)
                    .employee(employeeService.get(in.employeeId()))
                    .rate(in.rate() != null ? in.rate() : BigDecimal.valueOf(100))
                    .build());
        }
        return findGroupEmployees(groupId);
    }

    /**
     * 원본 수당리스트 [사용중단/재사용 ▲] 의 [삭제] — '삭제하겠습니까?' 뒤에 실제로 지운다.
     * 급여 그룹이 물고 있으면 FK 가 막는다(GlobalExceptionHandler 가 알린다).
     */
    @Transactional
    public void deleteItem(Long id) {
        PayItem target = item(id);
        formulaRepository.deleteAll(formulaRepository.findByItem(id));   // 항목의 계산식리스트는 항목과 함께 간다
        itemRepository.delete(target);
        itemRepository.flush();
        recordList(target.getKind(), com.erp.common.history.ChangeHistoryService.DELETED);
    }

    // ── 사원등록 [급여지급사항] ─────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<PaySettingDtos.EmployeePayItemResponse> findEmployeePayItems(Long employeeId) {
        employeeService.get(employeeId);   // 없는 사원이면 404
        return employeePayItemRepository.findWithItemByEmployeeId(employeeId).stream()
                .map(e -> new PaySettingDtos.EmployeePayItemResponse(e.getPayItem().getId(), e.getPayItem().getName(), e.getAmount()))
                .toList();
    }

    /** [저장(F8)] — 그 사원의 칸을 통째로 바꾼다. 빈 칸은 화면이 보내지 않는다. */
    @Transactional
    public List<PaySettingDtos.EmployeePayItemResponse> replaceEmployeePayItems(Long employeeId, List<PaySettingDtos.EmployeePayItemInput> inputs) {
        employeeService.findAllIncludingResigned().stream().filter(e -> e.id().equals(employeeId)).findFirst()
                .orElseThrow(() -> ApiException.notFound("사원을 찾을 수 없습니다. id=" + employeeId));
        employeePayItemRepository.deleteByEmployeeId(employeeId);
        employeePayItemRepository.flush();
        Set<Long> seen = new HashSet<>();
        for (var in : inputs == null ? List.<PaySettingDtos.EmployeePayItemInput>of() : inputs) {
            if (!seen.add(in.payItemId())) {
                throw ApiException.badRequest("같은 항목을 두 번 넣을 수 없습니다.");
            }
            employeePayItemRepository.save(EmployeePayItem.builder()
                    .employeeId(employeeId).payItem(item(in.payItemId())).amount(in.amount()).build());
        }
        return findEmployeePayItems(employeeId);
    }

    // ── 사원등록 [기타설정] ──────────────────────────────────────────

    /** 급여계산용 · 화면용 — 행이 없으면 처음 값. */
    @Transactional(readOnly = true)
    public EmployeePayrollSetting payrollSetting(Long employeeId) {
        return payrollSettingRepository.findByEmployeeId(employeeId)
                .orElseGet(() -> EmployeePayrollSetting.defaults(employeeId));
    }

    @Transactional(readOnly = true)
    public PaySettingDtos.EmployeePayrollSettingResponse findPayrollSetting(Long employeeId) {
        employeeService.get(employeeId);   // 없는 사원이면 404
        return PaySettingDtos.EmployeePayrollSettingResponse.from(payrollSetting(employeeId));
    }

    @Transactional
    public PaySettingDtos.EmployeePayrollSettingResponse savePayrollSetting(Long employeeId, PaySettingDtos.EmployeePayrollSettingRequest req) {
        employeeService.findAllIncludingResigned().stream().filter(e -> e.id().equals(employeeId)).findFirst()
                .orElseThrow(() -> ApiException.notFound("사원을 찾을 수 없습니다. id=" + employeeId));
        int scale = req.taxScale() == null ? 100 : req.taxScale();
        if (scale != 80 && scale != 100 && scale != 120) {
            throw ApiException.badRequest("간이세액표 적용방법은 80 % · 100 % · 120 % 중 하나입니다.");
        }
        EmployeePayrollSetting s = payrollSettingRepository.findByEmployeeId(employeeId)
                .orElseGet(() -> EmployeePayrollSetting.defaults(employeeId));
        if (req.pensionMode() != null && req.pensionMode() != InsuranceCalc.AUTO && req.pensionMode() != InsuranceCalc.NONE) {
            throw ApiException.badRequest("국민연금은 기준소득월액기준 · 안함 중 하나입니다.");
        }
        s.setHealthMode(req.healthMode() == null ? InsuranceBasis.AUTO : req.healthMode());
        s.setHealthBaseAmount(req.healthBaseAmount());
        s.setHealthCardNo(blankToNull(req.healthCardNo()));
        s.setInsuranceReduction(Boolean.TRUE.equals(req.insuranceReduction()));
        s.setLongTermCare(req.longTermCare() == null || req.longTermCare());
        s.setPensionMode(req.pensionMode() == null ? InsuranceCalc.AUTO : req.pensionMode());
        s.setPensionBaseAmount(req.pensionBaseAmount());
        s.setEmploymentMode(req.employmentMode() == null ? InsuranceBasis.AUTO : req.employmentMode());
        s.setEmploymentBaseAmount(req.employmentBaseAmount());
        s.setSpouseDeduction(Boolean.TRUE.equals(req.spouseDeduction()));
        s.setDependents(req.dependents() == null ? 0 : req.dependents());
        s.setChildren(req.children() == null ? 0 : req.children());
        s.setTaxScale(scale);
        s.setReligiousWorker(Boolean.TRUE.equals(req.religiousWorker()));
        s.setHouseholdType(req.householdType() == null ? HouseholdType.HEAD : req.householdType());
        s.setHomeless(Boolean.TRUE.equals(req.homeless()));
        s.setForeigner(Boolean.TRUE.equals(req.foreigner()));
        s.setNationality(blankToNull(req.nationality()));
        s.setNonResident(Boolean.TRUE.equals(req.nonResident()));
        s.setResidenceCountry(blankToNull(req.residenceCountry()));
        s.setSingleTaxRate(Boolean.TRUE.equals(req.singleTaxRate()));
        s.setDomesticDispatched(Boolean.TRUE.equals(req.domesticDispatched()));
        return PaySettingDtos.EmployeePayrollSettingResponse.from(payrollSettingRepository.save(s));
    }

    private static String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }

    /** 급여계산용 — 모든 수당 · 공제 항목 id */
    @Transactional(readOnly = true)
    public List<Long> allItemIds() {
        return itemRepository.findAll().stream().map(PayItem::getId).toList();
    }

    /** 급여계산용 — 이 사원이 [급여지급사항]에 넣어 둔 항목 id → 금액. */
    @Transactional(readOnly = true)
    public java.util.Map<Long, BigDecimal> employeeAmounts(Long employeeId) {
        var m = new java.util.LinkedHashMap<Long, BigDecimal>();
        for (EmployeePayItem e : employeePayItemRepository.findWithItemByEmployeeId(employeeId)) {
            m.put(e.getPayItem().getId(), e.getAmount());
        }
        return m;
    }

    // ── 내부 ──────────────────────────────────────────────────────────

    private void applyLines(PayGroup g, List<GroupLineInput> inputs) {
        Set<Long> seen = new HashSet<>();
        for (GroupLineInput in : inputs) {
            if (!seen.add(in.payItemId())) {
                throw ApiException.badRequest("같은 항목을 두 번 넣을 수 없습니다.");
            }
            PayItem i = item(in.payItemId());
            if (!i.isActive()) {
                throw ApiException.badRequest("사용중지된 항목은 그룹에 넣을 수 없습니다: " + i.getName());
            }
            g.addLine(PayGroupLine.builder().payItem(i).amount(in.amount()).build());
        }
    }

    /** 같은 모듈의 근무기록(workrecord)이 수당항목 엔티티를 얻는 진입점. */
    @Transactional(readOnly = true)
    public PayItem item(Long id) {
        return itemRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("수당·공제 항목을 찾을 수 없습니다. id=" + id));
    }

    /** 수당 이름 → 원본 [비과세유형]. 마스터에 없는 이름(손으로 넣은 줄)은 NONE. */
    @Transactional(readOnly = true)
    public PayTaxFreeType taxFreeTypeByName(String name) {
        return itemRepository.findAll().stream()
                .filter(i -> i.getKind() == PayslipLineKind.ALLOWANCE && i.getName().equals(name))
                .findFirst().map(PayItem::getTaxFreeType).orElse(PayTaxFreeType.NONE);
    }

    /** 금액직접입력으로 명세에 새로 붙는 수당 줄의 과세 여부 — 같은 이름 수당항목을 따르고, 없으면 과세. */
    @Transactional(readOnly = true)
    public boolean taxableByName(String name) {
        return itemRepository.findAll().stream()
                .filter(i -> i.getKind() == PayslipLineKind.ALLOWANCE && i.getName().equals(name))
                .findFirst().map(PayItem::isTaxable).orElse(true);
    }

    private PayGroup group(Long id) {
        return groupRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("그룹을 찾을 수 없습니다. id=" + id));
    }
}
