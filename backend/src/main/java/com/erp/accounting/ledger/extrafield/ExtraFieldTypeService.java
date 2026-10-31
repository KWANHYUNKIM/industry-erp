package com.erp.accounting.ledger.extrafield;

import com.erp.accounting.ledger.account.Account;
import com.erp.accounting.ledger.account.AccountRepository;
import com.erp.accounting.ledger.extrafield.dto.ExtraFieldDtos.*;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/** 회계 I › 기초등록 › 추가항목유형등록(E010118). */
@Service
@RequiredArgsConstructor
public class ExtraFieldTypeService {

    private final ExtraFieldTypeRepository typeRepository;
    private final ExtraFieldTypeSlotRepository slotRepository;
    private final ExtraFieldTypeAccountRepository typeAccountRepository;
    private final AccountRepository accountRepository;

    private static TypeResponse toResponse(ExtraFieldType t) {
        return new TypeResponse(t.getId(), t.getCode(), t.getName(), t.isActive(), t.getUpdatedAt());
    }

    private ExtraFieldType get(Long id) {
        return typeRepository.findById(id).orElseThrow(() -> ApiException.notFound("추가항목유형을 찾을 수 없습니다. id=" + id));
    }

    @Transactional(readOnly = true)
    public List<TypeResponse> findAll() {
        return typeRepository.findAll(Sort.by("code")).stream().map(ExtraFieldTypeService::toResponse).toList();
    }

    /** 유형 코드 → 묶인 계정 id (목록 조건 [계정]) */
    @Transactional(readOnly = true)
    public Map<Long, List<Long>> accountIdsByType() {
        return typeAccountRepository.findAllWithRefs().stream().collect(Collectors.groupingBy(
                ta -> ta.getType().getId(), Collectors.mapping(ta -> ta.getAccount().getId(), Collectors.toList())));
    }

    @Transactional
    public TypeResponse create(SaveTypeRequest req) {
        String code = req.code().trim();
        if (typeRepository.existsByCode(code)) throw ApiException.conflict("이미 추가항목유형등록에 존재하는 코드입니다.");
        return toResponse(typeRepository.save(ExtraFieldType.builder().code(code).name(req.name().trim()).build()));
    }

    @Transactional
    public TypeResponse update(Long id, SaveTypeRequest req) {
        ExtraFieldType t = get(id);
        t.setName(req.name().trim());
        return toResponse(t);
    }

    @Transactional
    public void setActive(List<Long> ids, boolean active) {
        for (Long id : ids) get(id).setActive(active);
    }

    @Transactional
    public void delete(List<Long> ids) {
        for (Long id : ids) typeRepository.delete(get(id));
    }

    /** 추가항목설정 — 항목 1~8 한 줄씩(안 켠 항목도 줄은 나온다). */
    @Transactional(readOnly = true)
    public List<SlotRow> slots(Long typeId) {
        get(typeId);
        Map<Integer, ExtraFieldTypeSlot> saved = slotRepository.findByTypeIdOrderBySlotNo(typeId).stream()
                .collect(Collectors.toMap(ExtraFieldTypeSlot::getSlotNo, Function.identity()));
        return ExtraFieldSlots.ALL.stream().map(s -> {
            ExtraFieldTypeSlot v = saved.get(s.no());
            return new SlotRow(s.no(), s.name(), s.kind(), v != null && v.isEnabled(), v != null && v.isRequired(), v == null ? null : v.getDefaultValue());
        }).toList();
    }

    @Transactional
    public List<SlotRow> saveSlots(Long typeId, List<SlotSave> req) {
        ExtraFieldType t = get(typeId);
        Map<Integer, ExtraFieldTypeSlot> saved = slotRepository.findByTypeIdOrderBySlotNo(typeId).stream()
                .collect(Collectors.toMap(ExtraFieldTypeSlot::getSlotNo, Function.identity()));
        for (SlotSave s : req) {
            if (s.no() < 1 || s.no() > 8) throw ApiException.badRequest("추가항목은 1~8 입니다.");
            ExtraFieldTypeSlot v = saved.get(s.no());
            if (v == null) {
                v = ExtraFieldTypeSlot.builder().type(t).slotNo(s.no()).build();
            }
            v.setEnabled(s.enabled());
            v.setRequired(s.enabled() && s.required());
            v.setDefaultValue(s.defaultValue() == null || s.defaultValue().isBlank() ? null : s.defaultValue());
            slotRepository.save(v);
        }
        return slots(typeId);
    }

    @Transactional(readOnly = true)
    public List<AccountRow> accounts(Long typeId) {
        get(typeId);
        return typeAccountRepository.findByTypeWithAccount(typeId).stream()
                .map(ta -> new AccountRow(ta.getId(), ta.getAccount().getId(), ta.getAccount().getCode(), ta.getAccount().getName())).toList();
    }

    @Transactional
    public List<AccountRow> addAccounts(Long typeId, List<Long> accountIds) {
        ExtraFieldType t = get(typeId);
        for (Long aid : accountIds) {
            if (typeAccountRepository.existsByTypeIdAndAccountId(typeId, aid)) continue;
            Account a = accountRepository.findById(aid).orElseThrow(() -> ApiException.badRequest("계정을 찾을 수 없습니다. id=" + aid));
            typeAccountRepository.save(ExtraFieldTypeAccount.builder().type(t).account(a).build());
        }
        return accounts(typeId);
    }

    @Transactional
    public List<AccountRow> removeAccounts(Long typeId, List<Long> rowIds) {
        for (Long rid : rowIds) typeAccountRepository.deleteById(rid);
        return accounts(typeId);
    }

    public List<CompanySlot> companySlots() {
        return ExtraFieldSlots.ALL.stream().map(s -> new CompanySlot(s.no(), s.name(), s.kind(), s.setting())).toList();
    }
}
