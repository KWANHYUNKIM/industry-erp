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
        return PayItemResponse.from(itemRepository.save(i));
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
        // 원본 [삭제]: '한번 지워진 자료는 복구될 수 없습니다.' — 적용사원 연결도 함께 지운다
        groupEmployeeRepository.deleteByGroup_Id(id);
        groupRepository.delete(group(id));
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
        itemRepository.delete(item(id));
        itemRepository.flush();
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

    private PayGroup group(Long id) {
        return groupRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("그룹을 찾을 수 없습니다. id=" + id));
    }
}
