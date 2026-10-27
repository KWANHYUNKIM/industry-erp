package com.erp.groupware.fieldwork;

import com.erp.common.ApiException;
import com.erp.auth.user.User;
import com.erp.groupware.fieldwork.dto.FieldWorkDtos.CreateFieldWorkRequest;
import com.erp.groupware.fieldwork.dto.FieldWorkDtos.FieldWorkResponse;
import com.erp.groupware.fieldwork.dto.FieldWorkDtos.FieldWorkSummary;
import com.erp.groupware.fieldwork.dto.FieldWorkDtos.RejectRequest;
import com.erp.auth.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import com.erp.groupware.fieldwork.dto.FieldWorkDtos;

/**
 * 외근계: 신청 → 승인/반려.
 *
 * 같은 날 같은 사람의 외근계는 하나만 살아 있을 수 있다(반려된 건 제외). 두 건이 승인돼 있으면
 * 근태에서 그 날을 외근으로 볼지 두 번 셀지 애매해진다.
 *
 * 자기 외근계는 자기가 승인하지 못한다. 승인이 형식이 되면 신청 절차 자체가 의미를 잃는다.
 */
@Service
@RequiredArgsConstructor
public class FieldWorkService {

    private final FieldWorkRepository fieldWorkRepository;
    private final UserRepository userRepository;

    /** 외근조회 (기간). 기본은 이번 달. */
    @Transactional(readOnly = true)
    public FieldWorkSummary find(LocalDate from, LocalDate to) {
        LocalDate f = from != null ? from : LocalDate.now().withDayOfMonth(1);
        LocalDate t = to != null ? to : LocalDate.now();
        List<FieldWork> all = fieldWorkRepository.findByPeriod(f, t);

        long requested = all.stream().filter(x -> x.getStatus() == FieldWorkStatus.REQUESTED).count();
        long approved = all.stream().filter(x -> x.getStatus() == FieldWorkStatus.APPROVED).count();
        long rejected = all.stream().filter(x -> x.getStatus() == FieldWorkStatus.REJECTED).count();

        return new FieldWorkSummary(requested, approved, rejected,
                all.stream().map(FieldWorkResponse::from).toList());
    }

    /**
     * 외근 한 건 = 차량 운행 한 번(원본 외근입력). 같은 날 여러 번 다닐 수 있다 — 원본 [일자No.] 가
     * '2026/09/10 -1' 처럼 그날 안의 차례를 단다. 예전의 '하루 한 건' 막음은 우리 신청서 모델의 것이라 뺐다.
     */
    @Transactional
    public FieldWorkResponse create(CreateFieldWorkRequest req, String username) {
        User user = req.userId() != null
                ? userRepository.findById(req.userId())
                        .orElseThrow(() -> ApiException.notFound("사용자를 찾을 수 없습니다. id=" + req.userId()))
                : user(username);
        if (req.startTime() != null && req.endTime() != null && req.endTime().isBefore(req.startTime())) {
            throw ApiException.badRequest("종료 시각이 시작 시각보다 빠를 수 없습니다.");
        }

        FieldWork f = FieldWork.builder()
                .user(user)
                .workDate(req.workDate())
                .startTime(req.startTime())
                .endTime(req.endTime())
                .destination(req.destination())
                .purpose(req.purpose())
                .departure(req.departure())
                .vehicleNo(req.vehicleNo())
                .vehicleName(req.vehicleName())
                .usePurpose(req.usePurpose())
                .distance(distanceOf(req))
                .odometerBefore(req.odometerBefore())
                .odometerAfter(req.odometerAfter())
                .status(FieldWorkStatus.REQUESTED)
                .build();
        return FieldWorkResponse.from(fieldWorkRepository.save(f));
    }

    /**
     * 원본 외근현황 · 외근조회의 [일자]를 누르면 같은 '외근입력' 창이 그 기록으로 열리고 [저장(F8)]으로 고친다
     * (2026-10-03 실측). 고치는 규칙은 지우기와 같다 — 본인 기록만, 승인 전에만.
     */
    @Transactional
    public FieldWorkResponse update(Long id, CreateFieldWorkRequest req, String username) {
        FieldWork f = fieldWorkRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("외근계를 찾을 수 없습니다. id=" + id));
        if (!f.getUser().getUsername().equals(username)) {
            throw ApiException.badRequest("본인이 신청한 외근계만 고칠 수 있습니다.");
        }
        if (f.getStatus() != FieldWorkStatus.REQUESTED) {
            throw ApiException.badRequest("이미 " + f.getStatus().getDisplayName() + "된 외근계는 고칠 수 없습니다.");
        }
        if (req.startTime() != null && req.endTime() != null && req.endTime().isBefore(req.startTime())) {
            throw ApiException.badRequest("종료 시각이 시작 시각보다 빠를 수 없습니다.");
        }
        if (req.userId() != null && !req.userId().equals(f.getUser().getId())) {
            f.setUser(userRepository.findById(req.userId())
                    .orElseThrow(() -> ApiException.notFound("사용자를 찾을 수 없습니다. id=" + req.userId())));
        }
        f.setWorkDate(req.workDate());
        f.setStartTime(req.startTime());
        f.setEndTime(req.endTime());
        f.setDestination(req.destination());
        f.setPurpose(req.purpose());
        f.setDeparture(req.departure());
        f.setVehicleNo(req.vehicleNo());
        f.setVehicleName(req.vehicleName());
        f.setUsePurpose(req.usePurpose());
        f.setDistance(distanceOf(req));
        f.setOdometerBefore(req.odometerBefore());
        f.setOdometerAfter(req.odometerAfter());
        return FieldWorkResponse.from(f);
    }

    @Transactional
    public FieldWorkResponse approve(Long id, String username) {
        FieldWork f = pending(id, "승인");
        User approver = user(username);
        if (f.getUser().getId().equals(approver.getId())) {
            throw ApiException.badRequest("자기 외근계는 자기가 승인할 수 없습니다.");
        }
        f.setStatus(FieldWorkStatus.APPROVED);
        f.setApprover(approver);
        return FieldWorkResponse.from(f);
    }

    @Transactional
    public FieldWorkResponse reject(Long id, RejectRequest req, String username) {
        FieldWork f = pending(id, "반려");
        User approver = user(username);
        if (f.getUser().getId().equals(approver.getId())) {
            throw ApiException.badRequest("자기 외근계는 자기가 반려할 수 없습니다.");
        }
        f.setStatus(FieldWorkStatus.REJECTED);
        f.setApprover(approver);
        f.setRejectReason(req.reason());
        return FieldWorkResponse.from(f);
    }

    /** 신청 취소는 본인만, 승인 전에만. */
    @Transactional
    public void cancel(Long id, String username) {
        FieldWork f = fieldWorkRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("외근계를 찾을 수 없습니다. id=" + id));
        if (!f.getUser().getUsername().equals(username)) {
            throw ApiException.badRequest("본인이 신청한 외근계만 취소할 수 있습니다.");
        }
        if (f.getStatus() != FieldWorkStatus.REQUESTED) {
            throw ApiException.badRequest("이미 " + f.getStatus().getDisplayName() + "된 외근계는 취소할 수 없습니다.");
        }
        fieldWorkRepository.delete(f);
    }

    /**
     * 운행거리 — 두 계기판 값이 다 있으면 원본처럼 주행후 − 주행전(17,000 − 16,500 = 500), 아니면 적은 값.
     * 주행후가 주행전보다 작으면 거리를 셀 수 없다.
     */
    private java.math.BigDecimal distanceOf(CreateFieldWorkRequest req) {
        if (req.odometerBefore() != null && req.odometerAfter() != null) {
            if (req.odometerAfter().compareTo(req.odometerBefore()) < 0) {
                throw ApiException.badRequest("주행후 계기판거리가 주행전 계기판거리보다 작습니다.");
            }
            return req.odometerAfter().subtract(req.odometerBefore());
        }
        return req.distance();
    }

    /** 원본: 차량을 고르면 [주행전 계기판거리]에 그 차량의 마지막 주행후 값이 들어간다. 기록이 없으면 null. */
    @Transactional(readOnly = true)
    public java.math.BigDecimal lastOdometer(String vehicleNo) {
        return fieldWorkRepository.findAll().stream()
                .filter(f -> vehicleNo != null && vehicleNo.equalsIgnoreCase(f.getVehicleNo()) && f.getOdometerAfter() != null)
                .max(java.util.Comparator.comparing(FieldWork::getWorkDate).thenComparing(FieldWork::getId))
                .map(FieldWork::getOdometerAfter)
                .orElse(null);
    }

    private FieldWork pending(Long id, String action) {
        FieldWork f = fieldWorkRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("외근계를 찾을 수 없습니다. id=" + id));
        if (f.getStatus() != FieldWorkStatus.REQUESTED) {
            throw ApiException.conflict("이미 " + f.getStatus().getDisplayName() + "된 외근계입니다. ("
                    + action + " 불가)");
        }
        return f;
    }

    private User user(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> ApiException.notFound("사용자를 찾을 수 없습니다: " + username));
    }
}
