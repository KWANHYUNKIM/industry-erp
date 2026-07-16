package com.erp.groupware.service;

import com.erp.common.ApiException;
import com.erp.groupware.domain.FieldWork;
import com.erp.auth.domain.User;
import com.erp.groupware.domain.enums.FieldWorkStatus;
import com.erp.groupware.dto.FieldWorkDtos.CreateFieldWorkRequest;
import com.erp.groupware.dto.FieldWorkDtos.FieldWorkResponse;
import com.erp.groupware.dto.FieldWorkDtos.FieldWorkSummary;
import com.erp.groupware.dto.FieldWorkDtos.RejectRequest;
import com.erp.groupware.repository.FieldWorkRepository;
import com.erp.auth.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import com.erp.groupware.dto.FieldWorkDtos;

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

    @Transactional
    public FieldWorkResponse create(CreateFieldWorkRequest req, String username) {
        User user = user(username);
        if (req.startTime() != null && req.endTime() != null && req.endTime().isBefore(req.startTime())) {
            throw ApiException.badRequest("종료 시각이 시작 시각보다 빠를 수 없습니다.");
        }
        if (fieldWorkRepository.existsByUser_IdAndWorkDateAndStatusNot(
                user.getId(), req.workDate(), FieldWorkStatus.REJECTED)) {
            throw ApiException.conflict(req.workDate() + " 외근계가 이미 있습니다. 기존 건을 반려하거나 취소한 뒤 신청하세요.");
        }

        FieldWork f = FieldWork.builder()
                .user(user)
                .workDate(req.workDate())
                .startTime(req.startTime())
                .endTime(req.endTime())
                .destination(req.destination())
                .purpose(req.purpose())
                .status(FieldWorkStatus.REQUESTED)
                .build();
        return FieldWorkResponse.from(fieldWorkRepository.save(f));
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
