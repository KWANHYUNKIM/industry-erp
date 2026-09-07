package com.erp.accounting.service;

import com.erp.common.ApiException;
import com.erp.accounting.domain.Account;
import com.erp.accounting.dto.AccountDtos.AccountResponse;
import com.erp.accounting.dto.AccountDtos.CreateAccountRequest;
import com.erp.accounting.dto.AccountDtos.UpdateAccountRequest;
import com.erp.accounting.repository.AccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import com.erp.accounting.dto.AccountDtos;

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

    /**
     * 새로 <b>고르는</b> 자리에서 쓴다. 사용중지한 계정은 거절한다.
     *
     * <p>폐지한 계정에 새 잔액이 쌓이면 재무제표에 없어야 할 줄이 계속 남는다.
     * 실측했더니 일반전표입력이 사용중지한 계정을 그대로 받았다.
     *
     * <p>자동으로 만드는 분개(판매 → 외상매출금 …)는 <b>계정코드</b>로 찾으므로 여기를
     * 지나지 않는다. 그쪽까지 막으면 기준계정 하나를 잘못 내렸을 때 전표 저장이 통째로 막힌다.
     */
    @Transactional(readOnly = true)
    public Account getUsable(Long id) {
        Account a = accountRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("계정과목을 찾을 수 없습니다. id=" + id));
        if (!a.isActive()) {
            throw ApiException.badRequest(
                    "사용중지된 계정과목입니다: " + a.getCode() + " " + a.getName());
        }
        return a;
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
