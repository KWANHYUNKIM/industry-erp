package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.Account;
import com.erp.dto.AccountDtos.AccountResponse;
import com.erp.dto.AccountDtos.CreateAccountRequest;
import com.erp.dto.AccountDtos.UpdateAccountRequest;
import com.erp.repository.AccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class AccountService {

    private final AccountRepository accountRepository;

    @Transactional(readOnly = true)
    public List<AccountResponse> findAll() {
        return accountRepository.findAll(Sort.by(Sort.Direction.ASC, "code")).stream()
                .map(AccountResponse::from)
                .toList();
    }

    @Transactional
    public AccountResponse create(CreateAccountRequest req) {
        if (accountRepository.existsByCode(req.code())) {
            throw ApiException.badRequest("이미 존재하는 계정코드입니다: " + req.code());
        }
        Account a = Account.builder()
                .code(req.code())
                .name(req.name())
                .division(req.division())
                .detailCategory(req.detailCategory())
                .active(true)
                .build();
        return AccountResponse.from(accountRepository.save(a));
    }

    @Transactional
    public AccountResponse update(Long id, UpdateAccountRequest req) {
        Account a = accountRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("계정과목을 찾을 수 없습니다. id=" + id));
        if (req.name() != null) a.setName(req.name());
        if (req.division() != null) a.setDivision(req.division());
        if (req.detailCategory() != null) a.setDetailCategory(req.detailCategory());
        if (req.active() != null) a.setActive(req.active());
        return AccountResponse.from(a);
    }
}
