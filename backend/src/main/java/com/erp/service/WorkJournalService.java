package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.BusinessPartner;
import com.erp.domain.User;
import com.erp.domain.WorkJournal;
import com.erp.dto.WorkJournalDtos.CreateWorkJournalRequest;
import com.erp.dto.WorkJournalDtos.WorkJournalResponse;
import com.erp.repository.BusinessPartnerRepository;
import com.erp.repository.UserRepository;
import com.erp.repository.WorkJournalRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
public class WorkJournalService {

    private final WorkJournalRepository workJournalRepository;
    private final UserRepository userRepository;
    private final BusinessPartnerRepository partnerRepository;

    @Transactional(readOnly = true)
    public List<WorkJournalResponse> findAll() {
        return workJournalRepository.findAllWithRefs().stream()
                .map(WorkJournalResponse::from)
                .toList();
    }

    @Transactional
    public WorkJournalResponse create(CreateWorkJournalRequest req, String username) {
        User author = userRepository.findByUsername(username)
                .orElseThrow(() -> ApiException.notFound("작성자를 찾을 수 없습니다."));

        WorkJournal journal = WorkJournal.builder()
                .reportDate(req.reportDate() != null ? req.reportDate() : LocalDate.now())
                .author(author)
                .department(req.department() != null ? req.department() : author.getDepartment())
                .partnerName(req.partnerName())
                .partner(matchPartner(req.partnerName()))
                .title(req.title())
                .content(req.content())
                .build();

        return WorkJournalResponse.from(workJournalRepository.save(journal));
    }

    /** 거래처명이 마스터와 정확히 일치할 때만 연결한다(없으면 null + 입력 문자열 보존). */
    private BusinessPartner matchPartner(String name) {
        if (name == null || name.isBlank()) return null;
        return partnerRepository.findByName(name.trim()).orElse(null);
    }
}
