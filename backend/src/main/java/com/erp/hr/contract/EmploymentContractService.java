package com.erp.hr.contract;

import com.erp.hr.department.DepartmentService;
import com.erp.hr.employee.EmployeeService;
import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.hr.employee.Employee;
import com.erp.hr.contract.dto.EmploymentContractDtos.ContractResponse;
import com.erp.hr.contract.dto.EmploymentContractDtos.CreateContractRequest;
import com.erp.hr.contract.dto.EmploymentContractDtos.SignContractRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import com.erp.hr.contract.dto.EmploymentContractDtos;

/** 전자근로계약: 작성 → 발송 → 서명. 서명된 계약은 근로조건의 확정 기록이라 수정하지 않는다. */
@Service
@RequiredArgsConstructor
public class EmploymentContractService {

    private final EmploymentContractRepository contractRepository;
    private final EmployeeService employeeService;
    private final DepartmentService departmentService;
    private final DocumentNoGenerator docNoGenerator;
    private final com.erp.common.FileStorageService fileStorage;
    private final EmploymentContractItemRepository itemRepository;

    /**
     * 원본 계약서입력 [저장(F8)] — 계약서명 · 첨부(PDF). 일자는 오늘, 진행단계는 '수신정보입력'(작성).
     * 받는 사원은 [수신정보입력]에서 고른다.
     */
    @Transactional
    public ContractResponse createDocument(EmploymentContractDtos.DocumentRequest req, String username) {
        java.time.LocalDate today = java.time.LocalDate.now();
        EmploymentContract c = EmploymentContract.builder()
                .contractNo(docNoGenerator.next("EC-", "employment_contracts", "contract_no", "start_date", today))
                .status(ContractStatus.DRAFT)
                .startDate(today)
                .createdBy(username)
                .build();
        applyDocument(c, req);
        return ContractResponse.from(contractRepository.save(c));
    }

    /** 계약서명 링크로 연 계약서입력 창의 [저장(F8)]. 요청한 계약서는 바꿀 수 없다. */
    @Transactional
    public ContractResponse updateDocument(Long id, EmploymentContractDtos.DocumentRequest req) {
        EmploymentContract c = get(id);
        requireDraft(c);
        applyDocument(c, req);
        return ContractResponse.from(c);
    }

    private void applyDocument(EmploymentContract c, EmploymentContractDtos.DocumentRequest req) {
        com.erp.common.StoredFile file = fileStorage.meta(req.attachmentFileId());
        String name = file.getName() != null ? file.getName().toLowerCase() : "";
        if (!name.endsWith(".pdf")) {
            throw ApiException.badRequest("PDF 파일만 첨부할 수 있습니다.");
        }
        fileStorage.claim(file.getId(), "HR");
        c.setContractName(req.contractName().trim());
        c.setAttachment(file);
        c.setTwoFactor(req.twoFactor());
        c.setCategory(blankToNull(req.category()));
        c.setDepartment(req.departmentId() != null ? departmentService.get(req.departmentId()) : null);
        c.setProjectId(req.projectId());
        c.setRemark(blankToNull(req.remark()));
    }

    /** 원본 [복사] — 계약서명만 새로 받고 첨부 · 2차인증 · 구분 · 부서 · 프로젝트 · 전달메시지를 옮긴다. 수신정보는 옮기지 않는다. */
    @Transactional
    public ContractResponse copy(Long id, EmploymentContractDtos.CopyRequest req, String username) {
        EmploymentContract src = get(id);
        java.time.LocalDate today = java.time.LocalDate.now();
        EmploymentContract c = EmploymentContract.builder()
                .contractNo(docNoGenerator.next("EC-", "employment_contracts", "contract_no", "start_date", today))
                .status(ContractStatus.DRAFT)
                .startDate(today)
                .contractName(req.contractName().trim())
                .attachment(src.getAttachment())
                .twoFactor(src.isTwoFactor())
                .category(src.getCategory())
                .department(src.getDepartment())
                .projectId(src.getProjectId())
                .remark(src.getRemark())
                .createdBy(username)
                .build();
        return ContractResponse.from(contractRepository.save(c));
    }

    /** 원본 [수신정보입력] [저장(F8)] — 계약참여자1(사원) · 전달방식. */
    @Transactional
    public ContractResponse setRecipient(Long id, EmploymentContractDtos.RecipientRequest req) {
        EmploymentContract c = get(id);
        requireDraft(c);
        Employee e = employeeService.get(req.employeeId());
        if (!e.isActive()) {
            throw ApiException.badRequest("퇴사한 사원과는 근로계약을 맺을 수 없습니다: " + e.getName());
        }
        c.setEmployee(e);
        c.setDeliveryMethod(req.deliveryMethod());
        if (req.items() != null) {
            for (EmploymentContractDtos.ItemValue v : req.items()) {
                EmploymentContractItem i = getItem(id, v.id());
                i.setValue(v.value() == null || v.value().isBlank() ? null : v.value().trim());
            }
        }
        return ContractResponse.from(c);
    }

    /** 원본 [수신정보입력] › 계약참여자1 [항목등록] '항목리스트' — 이 계약서의 항목(등록 차례). */
    @Transactional(readOnly = true)
    public List<EmploymentContractDtos.ItemResponse> items(Long id) {
        get(id);
        return itemRepository.findByContractIdOrderBySortOrderAscIdAsc(id).stream()
                .map(EmploymentContractDtos.ItemResponse::from).toList();
    }

    /** '항목등록' [저장(F8)] — 안내 없이 창이 닫히고 항목리스트 끝에 붙는다(2026-10-24 실측). */
    @Transactional
    public EmploymentContractDtos.ItemResponse addItem(Long id, EmploymentContractDtos.ItemRequest req) {
        EmploymentContract c = get(id);
        requireDraft(c);
        int next = itemRepository.findByContractIdOrderBySortOrderAscIdAsc(id).stream()
                .mapToInt(EmploymentContractItem::getSortOrder).max().orElse(0) + 1;
        EmploymentContractItem i = EmploymentContractItem.builder().contract(c).name(req.name().trim()).sortOrder(next).build();
        return EmploymentContractDtos.ItemResponse.from(itemRepository.save(i));
    }

    /** '항목수정' [저장(F8)]. */
    @Transactional
    public EmploymentContractDtos.ItemResponse renameItem(Long id, Long itemId, EmploymentContractDtos.ItemRequest req) {
        requireDraft(get(id));
        EmploymentContractItem i = getItem(id, itemId);
        i.setName(req.name().trim());
        return EmploymentContractDtos.ItemResponse.from(i);
    }

    /** '항목수정' [삭제] — 원본 '삭제하겠습니까? 전송정보입력이 된 경우 해당 코드에 입력된 내용이 같이 삭제됩니다.' 값도 같이 사라진다. */
    @Transactional
    public void deleteItem(Long id, Long itemId) {
        requireDraft(get(id));
        itemRepository.delete(getItem(id, itemId));
    }

    private EmploymentContractItem getItem(Long contractId, Long itemId) {
        EmploymentContractItem i = itemRepository.findById(itemId)
                .orElseThrow(() -> ApiException.notFound("항목을 찾을 수 없습니다. id=" + itemId));
        if (!i.getContract().getId().equals(contractId)) {
            throw ApiException.notFound("항목을 찾을 수 없습니다. id=" + itemId);
        }
        return i;
    }

    /** 요청취소 — 진행중(발송) → 취소. 원본 근로계약현황 진행상태 '취소'. */
    @Transactional
    public ContractResponse cancelRequest(Long id) {
        EmploymentContract c = get(id);
        if (c.getStatus() != ContractStatus.SENT) {
            throw ApiException.conflict("진행중인 계약서만 요청취소할 수 있습니다. 현재: " + c.getStatus().getDisplayName());
        }
        c.setStatus(ContractStatus.TERMINATED);
        return ContractResponse.from(c);
    }

    /** 재요청 — 요청취소한 계약서를 다시 진행중으로. */
    @Transactional
    public ContractResponse reRequest(Long id) {
        EmploymentContract c = get(id);
        if (c.getStatus() != ContractStatus.TERMINATED || c.getSignedAt() != null) {
            throw ApiException.conflict("요청취소한 계약서만 재요청할 수 있습니다.");
        }
        c.setStatus(ContractStatus.SENT);
        c.setSentAt(LocalDateTime.now());
        return ContractResponse.from(c);
    }

    private static void requireDraft(EmploymentContract c) {
        if (c.getStatus() != ContractStatus.DRAFT) {
            throw ApiException.conflict("요청한 계약서는 수정할 수 없습니다. 현재: " + c.getStatus().getDisplayName());
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    @Transactional(readOnly = true)
    public List<ContractResponse> findAll() {
        return contractRepository.findAllWithRefs().stream()
                .map(ContractResponse::from)
                .toList();
    }

    @Transactional
    public ContractResponse create(CreateContractRequest req, String username) {
        Employee e = employeeService.get(req.employeeId());
        if (!e.isActive()) {
            throw ApiException.badRequest("퇴사한 사원과는 근로계약을 맺을 수 없습니다: " + e.getName());
        }
        if (req.type().requiresEndDate() && req.endDate() == null) {
            throw ApiException.badRequest(req.type().getDisplayName() + " 계약은 종료일이 있어야 합니다.");
        }
        if (req.endDate() != null && req.endDate().isBefore(req.startDate())) {
            throw ApiException.badRequest("계약 종료일이 시작일보다 앞설 수 없습니다.");
        }
        BigDecimal salary = req.monthlySalary() != null ? req.monthlySalary() : e.getBaseSalary();
        if (salary.signum() < 0) {
            throw ApiException.badRequest("급여는 0 이상이어야 합니다.");
        }
        int hours = req.weeklyHours() != null ? req.weeklyHours() : 40;
        if (hours <= 0 || hours > 52) {
            throw ApiException.badRequest("주당 근로시간은 1~52시간 사이여야 합니다.");
        }

        EmploymentContract c = EmploymentContract.builder()
                .contractNo(docNoGenerator.next("EC-", "employment_contracts", "contract_no", "start_date", req.startDate()))
                .employee(e)
                .type(req.type())
                .status(ContractStatus.DRAFT)
                .startDate(req.startDate())
                .endDate(req.endDate())
                // 계약 시점의 근로조건을 박아 둔다. 지정이 없으면 사원의 현재값을 복사한다.
                .department(req.departmentId() != null ? departmentService.get(req.departmentId()) : e.getDepartment())
                .jobTitle(req.jobTitle() != null && !req.jobTitle().isBlank() ? req.jobTitle().trim() : e.getJobTitle())
                .monthlySalary(salary)
                .weeklyHours(hours)
                .workPlace(req.workPlace())
                .duty(req.duty())
                .remark(req.remark())
                .createdBy(username)
                .build();
        return ContractResponse.from(contractRepository.save(c));
    }

    /** 작성 → 발송 */
    @Transactional
    public ContractResponse send(Long id) {
        EmploymentContract c = get(id);
        if (c.getStatus() != ContractStatus.DRAFT) {
            throw ApiException.conflict("작성 상태의 계약만 발송할 수 있습니다. 현재: " + c.getStatus().getDisplayName());
        }
        if (c.getEmployee() == null) {
            throw ApiException.badRequest("수신정보를 먼저 입력하기 바랍니다.");
        }
        c.setStatus(ContractStatus.SENT);
        c.setSentAt(java.time.LocalDateTime.now());
        return ContractResponse.from(c);
    }

    /**
     * 발송 → 서명완료. 같은 사원의 기간이 겹치는 다른 서명 계약이 있으면 거부한다.
     * (한 사람이 같은 기간에 두 개의 근로조건을 가질 수는 없다.)
     */
    @Transactional
    public ContractResponse sign(Long id, SignContractRequest req) {
        EmploymentContract c = get(id);
        if (c.getEmployee() == null) {
            throw ApiException.badRequest("수신정보를 먼저 입력하기 바랍니다.");
        }
        if (c.getStatus() != ContractStatus.SENT) {
            throw ApiException.conflict("발송된 계약만 서명할 수 있습니다. 현재: " + c.getStatus().getDisplayName());
        }
        List<EmploymentContract> overlapping = c.getEndDate() == null
                ? contractRepository.findActiveFrom(
                        c.getEmployee().getId(), ContractStatus.SIGNED, c.getId(), c.getStartDate())
                : contractRepository.findOverlapping(
                        c.getEmployee().getId(), ContractStatus.SIGNED, c.getId(), c.getStartDate(), c.getEndDate());
        if (!overlapping.isEmpty()) {
            throw ApiException.conflict("계약기간이 겹치는 서명 계약이 있습니다: " + overlapping.get(0).getContractNo());
        }
        c.setStatus(ContractStatus.SIGNED);
        c.setSignedAt(LocalDateTime.now());
        c.setSignedBy(req.signedBy().trim());
        return ContractResponse.from(c);
    }

    /** 서명된 계약의 해지 */
    @Transactional
    public ContractResponse terminate(Long id) {
        EmploymentContract c = get(id);
        if (c.getStatus() != ContractStatus.SIGNED) {
            throw ApiException.conflict("서명완료된 계약만 해지할 수 있습니다. 현재: " + c.getStatus().getDisplayName());
        }
        c.setStatus(ContractStatus.TERMINATED);
        return ContractResponse.from(c);
    }

    /** 아직 서명되지 않은 계약만 삭제할 수 있다. 서명·해지된 계약은 기록으로 남는다. */
    @Transactional
    public void delete(Long id) {
        EmploymentContract c = get(id);
        // 요청취소한(서명 전) 계약서는 지울 수 있다. 서명했던 계약은 기록으로 남는다.
        if (c.getStatus() == ContractStatus.SIGNED
                || (c.getStatus() == ContractStatus.TERMINATED && c.getSignedAt() != null)) {
            throw ApiException.conflict("서명된 계약은 삭제할 수 없습니다. 해지 처리하세요.");
        }
        contractRepository.delete(c);
    }

    private EmploymentContract get(Long id) {
        return contractRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("근로계약을 찾을 수 없습니다. id=" + id));
    }
}
