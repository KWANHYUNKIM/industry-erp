package com.erp.accounting.paymentagency;

import com.erp.common.DocumentNoGenerator;
import com.erp.accounting.paymentagency.dto.PaymentAgencyDtos.CreatePaymentAgencyRequest;
import com.erp.accounting.paymentagency.dto.PaymentAgencyDtos.PaymentAgencyResponse;
import com.erp.accounting.paymentagency.dto.PaymentAgencyDtos.UpdatePaymentAgencyRequest;
import com.erp.accounting.account.Account;
import com.erp.accounting.account.AccountRepository;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;

/** 결제대행사(PG) 마스터(E010114) CRUD. */
@Service
@RequiredArgsConstructor
public class PaymentAgencyService {

    private final AccountRepository accountRepository;
    private final com.erp.settings.currency.CurrencyService currencyService;
    private final DocumentNoGenerator documentNoGenerator;
    private final PaymentAgencyRepository repository;
    private final PaymentAgencyTransferRepository transferRepository;

    @Transactional(readOnly = true)
    public List<PaymentAgencyResponse> findAll() {
        return repository.findAll(Sort.by(Sort.Direction.ASC, "code")).stream()
                .map(PaymentAgencyResponse::from).toList();
    }

    @Transactional
    public PaymentAgencyResponse create(CreatePaymentAgencyRequest req) {
        String code = StringUtils.hasText(req.code()) ? req.code().trim() : generateCode();
        if (repository.existsByCode(code)) {
            throw ApiException.conflict("이미 존재하는 결제대행사코드입니다: " + code);
        }
        PaymentAgency p = PaymentAgency.builder()
                .code(code)
                .name(req.name())
                .ceoName(req.ceoName())
                .phone(req.phone())
                .email(req.email())
                .remark(req.remark())
                .active(true)
                .build();
        apply(p, req.accountId(), req.depositAccount(), req.searchKeyword(), req.feeRate(),
                req.regNoKind(), req.foreignCurrency(), req.currencyId(), req.bizType(), req.bizItem(), req.manager(),
                req.taxReport(), req.postalCode(), req.address(), req.postalCode2(), req.address2());
        return PaymentAgencyResponse.from(repository.save(p));
    }

    @Transactional
    public PaymentAgencyResponse update(Long id, UpdatePaymentAgencyRequest req) {
        PaymentAgency p = get(id);
        p.setName(req.name());
        p.setCeoName(req.ceoName());
        p.setPhone(req.phone());
        p.setEmail(req.email());
        p.setRemark(req.remark());
        apply(p, req.accountId(), req.depositAccount(), req.searchKeyword(), req.feeRate(),
                req.regNoKind(), req.foreignCurrency(), req.currencyId(), req.bizType(), req.bizItem(), req.manager(),
                req.taxReport(), req.postalCode(), req.address(), req.postalCode2(), req.address2());
        if (req.active() != null) {
            p.setActive(req.active());
        }
        return PaymentAgencyResponse.from(p);
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(get(id));
    }

    /** [이체정보] 이체정보리스트 — 등록한 차례대로. */
    @Transactional(readOnly = true)
    public List<com.erp.accounting.paymentagency.dto.PaymentAgencyDtos.TransferResponse> transfers(Long agencyId) {
        get(agencyId);
        return transferRepository.findByPaymentAgencyIdOrderByIdAsc(agencyId).stream()
                .map(com.erp.accounting.paymentagency.dto.PaymentAgencyDtos.TransferResponse::from).toList();
    }

    @Transactional
    public com.erp.accounting.paymentagency.dto.PaymentAgencyDtos.TransferResponse addTransfer(
            Long agencyId, com.erp.accounting.paymentagency.dto.PaymentAgencyDtos.SaveTransferRequest req) {
        PaymentAgencyTransfer t = PaymentAgencyTransfer.builder().paymentAgency(get(agencyId)).accountNo(req.accountNo().trim()).build();
        fillTransfer(t, req);
        return com.erp.accounting.paymentagency.dto.PaymentAgencyDtos.TransferResponse.from(transferRepository.save(t));
    }

    @Transactional
    public com.erp.accounting.paymentagency.dto.PaymentAgencyDtos.TransferResponse updateTransfer(
            Long transferId, com.erp.accounting.paymentagency.dto.PaymentAgencyDtos.SaveTransferRequest req) {
        PaymentAgencyTransfer t = transfer(transferId);
        fillTransfer(t, req);
        return com.erp.accounting.paymentagency.dto.PaymentAgencyDtos.TransferResponse.from(t);
    }

    @Transactional
    public void deleteTransfer(Long transferId) {
        transferRepository.delete(transfer(transferId));
    }

    private PaymentAgencyTransfer transfer(Long id) {
        return transferRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("이체정보를 찾을 수 없습니다. id=" + id));
    }

    /** 기본이체통장은 한 결제대행사에 하나 — 새로 기본으로 하면 다른 줄의 기본을 끈다. */
    private void fillTransfer(PaymentAgencyTransfer t, com.erp.accounting.paymentagency.dto.PaymentAgencyDtos.SaveTransferRequest req) {
        t.setBankCode(StringUtils.hasText(req.bankCode()) ? req.bankCode().trim() : null);
        t.setBankName(StringUtils.hasText(req.bankName()) ? req.bankName().trim() : null);
        t.setAccountNo(req.accountNo().trim());
        t.setHolder(StringUtils.hasText(req.holder()) ? req.holder().trim() : null);
        t.setMemo1(StringUtils.hasText(req.memo1()) ? req.memo1().trim() : null);
        t.setMemo2(StringUtils.hasText(req.memo2()) ? req.memo2().trim() : null);
        t.setDefaultTransfer(req.isDefault());
        if (req.isDefault()) {
            transferRepository.findByPaymentAgencyIdOrderByIdAsc(t.getPaymentAgency().getId()).stream()
                    .filter(o -> o != t && !o.getId().equals(t.getId())).forEach(o -> o.setDefaultTransfer(false));
        }
    }

    private PaymentAgency get(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("결제대행사를 찾을 수 없습니다. id=" + id));
    }

    /**
     * 원본 <b>[계정]</b>. 안 고르면 안 붙인다 — 회계반영할 때 사람이 고르면 된다.
     * 없는 id 를 조용히 무시하지 않는다: 화면이 잘못 보낸 것을 모르면 값이 사라진 줄 안다.
     */
    private Account account(Long id) {
        if (id == null) return null;
        return accountRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("계정을 찾을 수 없습니다. id=" + id));
    }

    /**
     * 원본 폼의 나머지 칸들을 한 자리에서 옮긴다 — 등록과 수정 두 곳에 같은 줄을 늘어놓으면
     * 한쪽만 고쳐 <b>등록에서는 저장되는데 수정하면 사라지는</b> 칸이 생긴다.
     *
     * <p>NOT NULL 셋(코드구분·업종별구분·세무신고)은 <b>안 보내면 기본값</b>을 쓴다.
     * null 을 그대로 넣으면 저장할 때 터진다.
     */
    private void apply(PaymentAgency p, Long accountId, String depositAccount, String searchKeyword,
                       java.math.BigDecimal feeRate, String regNoKind, Boolean foreignCurrency, Long currencyId,
                       String bizType, String bizItem, String manager, Boolean taxReport,
                       String postalCode, String address, String postalCode2, String address2) {
        p.setAccount(account(accountId));
        p.setDepositAccount(depositAccount);
        p.setSearchKeyword(searchKeyword);
        p.setFeeRate(feeRate != null ? feeRate : java.math.BigDecimal.ZERO);
        p.setRegNoKind(StringUtils.hasText(regNoKind) ? regNoKind : "사업자등록번호");
        p.setCurrency(currencyId != null ? currencyService.get(currencyId) : null);
        p.setForeignCurrency(p.getCurrency() != null || Boolean.TRUE.equals(foreignCurrency));
        p.setBizType(bizType);
        p.setBizItem(bizItem);
        p.setManager(manager);
        p.setTaxReport(taxReport == null || taxReport);
        p.setPostalCode(postalCode);
        p.setAddress(address);
        p.setPostalCode2(postalCode2);
        p.setAddress2(address2);
    }

    private String generateCode() {
        return documentNoGenerator.nextMasterCode("PA", "payment_agencies", "code", 3);
    }
}
