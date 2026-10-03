package com.erp.hr.attendancekind;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.hr.attendancekind.dto.AttendanceKindDtos.AttendanceKindRequest;
import com.erp.hr.attendancekind.dto.AttendanceKindDtos.AttendanceKindResponse;
import com.erp.hr.attendancekind.dto.AttendanceKindDtos.VacationKindRequest;
import com.erp.hr.attendancekind.dto.AttendanceKindDtos.VacationKindResponse;
import com.erp.hr.attendancekind.dto.AttendanceKindDtos.GrantCell;
import com.erp.hr.attendancekind.dto.AttendanceKindDtos.GrantRow;
import com.erp.hr.attendancekind.dto.AttendanceKindDtos.GrantSummary;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 관리 › 근태관리 › 기본사항등록 › 근태항목등록(원본 E020701). 근태코드는 비우면 다음 번호(30013 꼴),
 * 저장은 안내 없이 목록에 붙고, [사용중단/재사용 ▲] 의 삭제는 '삭제하시겠습니까?'.
 */
@Service
@RequiredArgsConstructor
public class AttendanceKindService {

    private final AttendanceKindRepository repository;
    private final VacationKindRepository vacationRepository;
    private final VacationGrantRepository grantRepository;
    private final com.erp.hr.employee.EmployeeService employeeService;
    private final DocumentNoGenerator documentNoGenerator;

    @Transactional(readOnly = true)
    public List<AttendanceKindResponse> findAll() {
        return repository.findAllByOrderByCodeAsc().stream().map(AttendanceKindResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public String nextCode() {
        return documentNoGenerator.nextMasterCode("", "attendance_kinds", "code", 5);
    }

    @Transactional
    public AttendanceKindResponse create(AttendanceKindRequest req) {
        String code = req.code() == null || req.code().isBlank() ? nextCode() : req.code().trim();
        if (repository.existsByCode(code)) throw ApiException.conflict("이미 등록된 근태코드입니다: " + code);
        if (repository.existsByName(req.name().trim())) throw ApiException.conflict("이미 등록된 근태명칭입니다: " + req.name().trim());
        AttendanceKind k = AttendanceKind.builder().code(code).active(true).build();
        apply(k, req);
        return AttendanceKindResponse.from(repository.save(k));
    }

    @Transactional
    public AttendanceKindResponse update(Long id, AttendanceKindRequest req) {
        AttendanceKind k = get(id);
        if (repository.existsByNameAndIdNot(req.name().trim(), id)) {
            throw ApiException.conflict("이미 등록된 근태명칭입니다: " + req.name().trim());
        }
        apply(k, req);
        if (req.active() != null) k.setActive(req.active());
        return AttendanceKindResponse.from(k);
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(get(id));
    }

    private void apply(AttendanceKind k, AttendanceKindRequest req) {
        k.setName(req.name().trim());
        k.setKindGroup(req.kindGroup() == null || req.kindGroup().isBlank() ? null : req.kindGroup().trim());
        k.setType(req.type());
        if (req.type() == AttendanceKindType.VACATION) {
            if (req.vacationKindId() == null) throw ApiException.badRequest("휴가코드를 입력 바랍니다.");
            k.setVacationKind(vacationRepository.findById(req.vacationKindId())
                    .orElseThrow(() -> ApiException.notFound("휴가항목을 찾을 수 없습니다.")));
        } else {
            k.setVacationKind(null);
        }
        k.setHourUnit(req.hourUnit());
        k.setRemark(req.remark() == null || req.remark().isBlank() ? null : req.remark().trim());
    }

    // ── 휴가항목등록(원본 E020702) ──────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<VacationKindResponse> findVacations() {
        return vacationRepository.findAllByOrderByPeriodFromDescCodeDesc().stream().map(VacationKindResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public String nextVacationCode() {
        return documentNoGenerator.nextMasterCode("", "vacation_kinds", "code", 5);
    }

    @Transactional
    public VacationKindResponse createVacation(VacationKindRequest req) {
        String code = req.code() == null || req.code().isBlank() ? nextVacationCode() : req.code().trim();
        if (vacationRepository.existsByCode(code)) throw ApiException.conflict("이미 등록된 휴가코드입니다: " + code);
        VacationKind v = VacationKind.builder().code(code).active(true).build();
        applyVacation(v, req);
        return VacationKindResponse.from(vacationRepository.save(v));
    }

    @Transactional
    public VacationKindResponse updateVacation(Long id, VacationKindRequest req) {
        VacationKind v = vacation(id);
        applyVacation(v, req);
        if (req.active() != null) v.setActive(req.active());
        return VacationKindResponse.from(v);
    }

    /** '삭제하시겠습니까?' — 근태항목이 휴가코드로 가리키고 있으면 막는다. */
    @Transactional
    public void deleteVacation(Long id) {
        VacationKind v = vacation(id);
        if (repository.existsByVacationKind_Id(id)) {
            throw ApiException.conflict("근태항목에 쓰인 휴가항목은 삭제할 수 없습니다: " + v.getName());
        }
        if (grantRepository.existsByVacationKind_Id(id)) {
            throw ApiException.conflict("사원별휴가일수가 등록된 휴가항목은 삭제할 수 없습니다: " + v.getName());
        }
        vacationRepository.delete(v);
    }

    // ── 사원별휴가일수조회(원본 E020703) ─────────────────────────────────────

    /** 목록 — 휴가항목마다 등록인원수. */
    @Transactional(readOnly = true)
    public List<GrantSummary> grantSummaries() {
        java.util.Map<Long, Long> counts = new java.util.HashMap<>();
        for (Object[] r : grantRepository.countByKind()) counts.put((Long) r[0], (Long) r[1]);
        return vacationRepository.findAllByOrderByPeriodFromDescCodeDesc().stream()
                .map(v -> new GrantSummary(v.getId(), v.getCode(), v.getName(), v.getPeriodFrom(), v.getPeriodTo(),
                        counts.getOrDefault(v.getId(), 0L)))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<GrantRow> grants(Long kindId) {
        vacation(kindId);
        return grantRepository.findByKind(kindId).stream().map(this::toRow).toList();
    }

    /** 사원별휴가일수입력 [저장] — 그 휴가항목의 줄을 통째로 바꾼다. 같은 사원은 한 줄. */
    @Transactional
    public List<GrantRow> saveGrants(Long kindId, List<GrantCell> cells) {
        VacationKind v = vacation(kindId);
        java.util.Set<Long> seen = new java.util.HashSet<>();
        for (GrantCell c : cells) {
            if (!seen.add(c.employeeId())) throw ApiException.badRequest("같은 사원을 두 번 넣었습니다.");
        }
        grantRepository.deleteByKind(kindId);
        grantRepository.flush();
        for (GrantCell c : cells) {
            grantRepository.save(VacationGrant.builder().vacationKind(v).employee(employeeService.get(c.employeeId()))
                    .carryOverDays(c.carryOverDays() != null ? c.carryOverDays() : java.math.BigDecimal.ZERO)
                    .currentDays(c.currentDays() != null ? c.currentDays() : java.math.BigDecimal.ZERO)
                    .build());
        }
        return grants(kindId);
    }

    /** 목록 [선택삭제] — 그 휴가항목에 등록한 사원별휴가일수를 지운다(휴가항목은 남는다). */
    @Transactional
    public void deleteGrants(Long kindId) {
        vacation(kindId);
        grantRepository.deleteByKind(kindId);
    }

    private GrantRow toRow(VacationGrant g) {
        var e = g.getEmployee();
        return new GrantRow(e.getId(), e.getCode(), e.getName(), e.getDepartment() != null ? e.getDepartment().getName() : "",
                e.getJobTitle() != null ? e.getJobTitle() : "", e.getHireDate(),
                g.getCarryOverDays(), g.getCurrentDays(), g.getCarryOverDays().add(g.getCurrentDays()));
    }

    private void applyVacation(VacationKind v, VacationKindRequest req) {
        if (req.periodTo().isBefore(req.periodFrom())) throw ApiException.badRequest("기간의 끝이 시작보다 앞섭니다.");
        v.setName(req.name().trim());
        v.setPeriodFrom(req.periodFrom());
        v.setPeriodTo(req.periodTo());
        v.setCarryOver(req.carryOver());
        v.setRemark(req.remark() == null || req.remark().isBlank() ? null : req.remark().trim());
    }

    private VacationKind vacation(Long id) {
        return vacationRepository.findById(id).orElseThrow(() -> ApiException.notFound("휴가항목을 찾을 수 없습니다."));
    }

    private AttendanceKind get(Long id) {
        return repository.findById(id).orElseThrow(() -> ApiException.notFound("근태항목을 찾을 수 없습니다."));
    }
}
