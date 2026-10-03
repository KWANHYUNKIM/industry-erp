package com.erp.accounting.subcontract;

import com.erp.accounting.account.Account;
import com.erp.accounting.account.AccountRepository;
import com.erp.accounting.journal.JournalEntry;
import com.erp.accounting.journal.JournalEntryRepository;
import com.erp.accounting.journal.JournalLine;
import com.erp.accounting.journal.JournalSourceType;
import com.erp.accounting.subcontract.dto.SubcontractReflectionDtos.GroupBy;
import com.erp.accounting.subcontract.dto.SubcontractReflectionDtos.ReflectRequest;
import com.erp.accounting.subcontract.dto.SubcontractReflectionDtos.ReflectResult;
import com.erp.accounting.subcontract.dto.SubcontractReflectionDtos.SubcontractRow;
import com.erp.accounting.subcontract.dto.SubcontractReflectionDtos.UnreflectRequest;
import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.production.production.ProductionService;
import com.erp.production.production.dto.ProductionDtos.SubcontractLine;
import com.erp.trade.partner.PartnerService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 원본 생산/외주 &gt; 외주비회계반영 &gt; <b>외주비일괄회계반영</b>.
 *
 * <p>생산입고 줄의 [외주비합계]·[외주비부가세]를 외주처별(또는 생산입고 전표별)로 모아 매입전표 하나로 넘긴다:
 * <b>차) 외주가공비(533) · 부가세대급금(135) / 대) 외상매입금(251)</b>. 외주처는 생산된공장(외주 창고)의
 * 외주거래처다. 넘긴 전표 id 는 생산입고 줄에 남는다 — 반영한 줄은 생산입고에서 고치거나 지울 수 없고,
 * 반영을 취소하면 회계전표를 지우고 줄을 풀어 준다.
 *
 * <p>분개를 짜는 작은 도우미를 JournalService 와 따로 둔다 — 그 파일의 private 도우미를 공개하지 않고
 * 이 기능이 쓰는 세 계정만 여기서 다룬다.
 */
@Service
@RequiredArgsConstructor
public class SubcontractReflectionService {

    /* accounting → production · trade 는 허용된 방향이다(CLAUDE.md 4.1). service 를 거친다(4.2). */
    private final ProductionService productionService;
    private final PartnerService partnerService;
    private final JournalEntryRepository entryRepository;
    private final AccountRepository accountRepository;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<SubcontractRow> list(LocalDate from, LocalDate to) {
        List<SubcontractLine> lines = productionService.findSubcontract(from, to);
        Map<Long, String> partnerNames = new HashMap<>();
        Map<Long, String> journalNos = new HashMap<>();
        List<Long> journalIds = lines.stream().map(SubcontractLine::journalId).filter(Objects::nonNull).distinct().toList();
        entryRepository.findAllById(journalIds).forEach(e -> journalNos.put(e.getId(), e.getDocNo()));
        List<SubcontractRow> out = new ArrayList<>();
        for (SubcontractLine l : lines) {
            String partnerName = l.outsourcingPartnerId() == null ? null
                    : partnerNames.computeIfAbsent(l.outsourcingPartnerId(), id -> partnerService.get(id).getName());
            out.add(new SubcontractRow(l.id(), l.prodNo(), l.lineNo(), l.productionDate(),
                    l.productId(), l.productCode(), l.productName(), l.producedQty(),
                    l.unitPrice(), l.amount(), l.vat(), l.amount().add(l.vat()),
                    l.fromWarehouseId(), l.fromWarehouseName(),
                    l.outsourcingPartnerId(), partnerName,
                    l.projectId(), l.employeeId(), l.note(),
                    l.journalId(), l.journalId() != null ? journalNos.get(l.journalId()) : null));
        }
        return out;
    }

    /**
     * 고른 줄을 매입전표로 넘긴다. 이미 넘긴 줄은 건너뛴다. 묶음마다 전표 하나 —
     * 거래처별이면 외주처 하나에, 전표별이면 생산입고 번호(와 외주처) 하나에. 전표 일자는 묶음의 마지막 생산일이다.
     */
    @Transactional
    public ReflectResult reflect(ReflectRequest req, String username) {
        Map<Long, SubcontractLine> byId = new HashMap<>();
        for (SubcontractLine l : productionService.findSubcontract(null, null)) byId.put(l.id(), l);

        Map<String, List<SubcontractLine>> groups = new LinkedHashMap<>();
        for (Long id : req.productionIds()) {
            SubcontractLine l = byId.get(id);
            if (l == null || l.journalId() != null) continue;
            String key = req.groupBy() == GroupBy.PARTNER
                    ? String.valueOf(l.outsourcingPartnerId())
                    : l.prodNo() + "|" + l.outsourcingPartnerId();
            groups.computeIfAbsent(key, k -> new ArrayList<>()).add(l);
        }
        if (groups.isEmpty()) throw ApiException.badRequest("회계반영할 외주비가 없습니다(이미 반영했거나 외주비가 0 입니다).");

        List<String> nos = new ArrayList<>();
        for (List<SubcontractLine> g : groups.values()) {
            SubcontractLine first = g.get(0);
            LocalDate date = g.stream().map(SubcontractLine::productionDate).max(Comparator.naturalOrder()).orElseThrow();
            BigDecimal supply = g.stream().map(SubcontractLine::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal vat = g.stream().map(SubcontractLine::vat).reduce(BigDecimal.ZERO, BigDecimal::add);
            String slips = String.join(",", g.stream().map(SubcontractLine::prodNo).distinct().toList());

            JournalEntry e = JournalEntry.builder()
                    .docNo(docNoGenerator.next("GL-", "journal_entries", "doc_no", "entry_date", date))
                    .entryDate(date)
                    .description("외주비 " + slips)
                    .partner(first.outsourcingPartnerId() != null ? partnerService.get(first.outsourcingPartnerId()) : null)
                    .sourceType(JournalSourceType.SUBCONTRACT)
                    .sourceId(first.id())
                    .createdBy(username)
                    .build();
            line(e, "533", supply, true, "외주가공비");
            if (vat.signum() != 0) line(e, "135", vat, true, "부가세대급금");
            line(e, "251", supply.add(vat), false, "외상매입금");
            if (!e.isBalanced()) {
                throw ApiException.badRequest("분개가 대차평형을 이루지 않습니다. 차변 " + e.totalDebit() + " ≠ 대변 " + e.totalCredit());
            }
            JournalEntry saved = entryRepository.save(e);
            productionService.markSubcontractJournal(g.stream().map(SubcontractLine::id).toList(), saved.getId());
            nos.add(saved.getDocNo());
        }
        return new ReflectResult(nos.size(), nos);
    }

    /** 반영취소 — 고른 줄이 걸린 회계전표를 지우고, 그 전표에 묶인 줄을 모두 푼다. */
    @Transactional
    public ReflectResult unreflect(UnreflectRequest req) {
        List<SubcontractLine> all = productionService.findSubcontract(null, null);
        List<Long> journalIds = all.stream().filter(l -> req.productionIds().contains(l.id()))
                .map(SubcontractLine::journalId).filter(Objects::nonNull).distinct().toList();
        if (journalIds.isEmpty()) throw ApiException.badRequest("반영취소할 외주비가 없습니다(아직 반영하지 않았습니다).");
        List<String> nos = new ArrayList<>();
        for (Long jid : journalIds) {
            List<Long> bound = all.stream().filter(l -> jid.equals(l.journalId())).map(SubcontractLine::id).toList();
            productionService.markSubcontractJournal(bound, null);
            entryRepository.findById(jid).ifPresent(e -> { nos.add(e.getDocNo()); entryRepository.delete(e); });
        }
        return new ReflectResult(nos.size(), nos);
    }

    private void line(JournalEntry e, String code, BigDecimal amount, boolean debit, String desc) {
        Account account = accountRepository.findByCode(code)
                .orElseThrow(() -> ApiException.badRequest("계정과목이 없습니다: " + code + " (계정과목등록 필요)"));
        /* 음수(반품 성격)는 반대편 양수로 적는다 — 분개 줄은 0 이상이어야 한다(JournalService 와 같은 규칙). */
        boolean d = amount.signum() < 0 ? !debit : debit;
        BigDecimal v = amount.abs();
        e.addLine(JournalLine.builder().account(account)
                .debit(d ? v : BigDecimal.ZERO).credit(d ? BigDecimal.ZERO : v).description(desc).build());
    }
}
