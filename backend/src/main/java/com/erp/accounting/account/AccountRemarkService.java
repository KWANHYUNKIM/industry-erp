package com.erp.accounting.account;

import com.erp.accounting.account.dto.AccountRemarkDtos.AccountRemarkRequest;
import com.erp.accounting.account.dto.AccountRemarkDtos.AccountRemarkResponse;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 계정별 적요 — 적요코드를 비우면 다음 번호(01, 02 …)를 붙인다(원본 '적요등록' 창이 01 을 미리 채운다). */
@Service
@RequiredArgsConstructor
public class AccountRemarkService {

    private final AccountRemarkRepository remarkRepository;
    private final AccountRepository accountRepository;

    @Transactional(readOnly = true)
    public List<AccountRemarkResponse> list(Long accountId) {
        return remarkRepository.findByAccountIdOrderByCodeAsc(accountId).stream().map(AccountRemarkResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public String nextCode(Long accountId) {
        int max = remarkRepository.findByAccountIdOrderByCodeAsc(accountId).stream()
                .map(AccountRemark::getCode).filter(c -> c.matches("\\d+")).mapToInt(Integer::parseInt).max().orElse(0);
        return String.format("%02d", max + 1);
    }

    @Transactional
    public AccountRemarkResponse create(Long accountId, AccountRemarkRequest req) {
        Account account = accountRepository.findById(accountId)
                .orElseThrow(() -> ApiException.notFound("계정과목을 찾을 수 없습니다. id=" + accountId));
        String code = req.code() == null || req.code().isBlank() ? nextCode(accountId) : req.code().trim();
        if (remarkRepository.existsByAccountIdAndCode(accountId, code)) {
            throw ApiException.badRequest("이미 존재하는 적요코드입니다: " + code);
        }
        return AccountRemarkResponse.from(remarkRepository.save(
                AccountRemark.builder().account(account).code(code).name(req.name().trim()).build()));
    }

    @Transactional
    public AccountRemarkResponse update(Long accountId, Long id, AccountRemarkRequest req) {
        AccountRemark r = get(accountId, id);
        r.setName(req.name().trim());
        return AccountRemarkResponse.from(r);
    }

    @Transactional
    public void delete(Long accountId, Long id) {
        remarkRepository.delete(get(accountId, id));
    }

    private AccountRemark get(Long accountId, Long id) {
        AccountRemark r = remarkRepository.findById(id).orElseThrow(() -> ApiException.notFound("적요를 찾을 수 없습니다. id=" + id));
        if (!r.getAccount().getId().equals(accountId)) throw ApiException.notFound("적요를 찾을 수 없습니다. id=" + id);
        return r;
    }
}
