package com.erp.accounting.vatinvoice;

import com.erp.accounting.journal.JournalEntry;
import com.erp.accounting.journal.JournalEntryRepository;
import com.erp.accounting.vatinvoice.dto.VatInvoiceMarkDtos.MarkResponse;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class VatInvoiceMarkService {

    private final VatInvoiceMarkRepository repository;
    private final JournalEntryRepository journalEntryRepository;

    @Transactional(readOnly = true)
    public List<MarkResponse> list() {
        return repository.findAll().stream().map(VatInvoiceMarkService::toResponse).toList();
    }

    @Transactional
    public List<MarkResponse> changeDocKind(List<Long> ids, VatDocKind docKind) {
        List<VatInvoiceMark> marks = marksOf(ids);
        marks.forEach(m -> m.setDocKind(docKind));
        return marks.stream().map(VatInvoiceMarkService::toResponse).toList();
    }

    /**
     * 원본: 종이(세금)계산서를 [타발행] 하면 '변경불가전표 … 종이(세금)계산서인 경우' 창이 뜨고 아무것도 바뀌지 않는다.
     */
    @Transactional
    public List<MarkResponse> changeProgress(List<Long> ids, VatInvoiceProgress progress) {
        List<VatInvoiceMark> marks = marksOf(ids);
        if (progress == VatInvoiceProgress.ELSEWHERE) {
            Map<Long, JournalEntry> entries = journalEntryRepository.findAllById(ids).stream()
                    .collect(Collectors.toMap(JournalEntry::getId, Function.identity()));
            String blocked = marks.stream().filter(m -> m.getDocKind() == VatDocKind.PAPER)
                    .map(m -> {
                        JournalEntry e = entries.get(m.getJournalEntryId());
                        return e.getEntryDate().toString().replace('-', '/') + "-" + e.getDocNo();
                    })
                    .collect(Collectors.joining(", "));
            if (!blocked.isEmpty()) {
                throw new ApiException(HttpStatus.BAD_REQUEST,
                        "아래의 전표는 변경할 수 없습니다. [변경불가전표] " + blocked + " | 종이(세금)계산서인 경우");
            }
        }
        marks.forEach(m -> m.setProgress(progress));
        return marks.stream().map(VatInvoiceMarkService::toResponse).toList();
    }

    private List<VatInvoiceMark> marksOf(List<Long> ids) {
        List<Long> distinct = List.copyOf(new HashSet<>(ids));
        if (journalEntryRepository.findAllById(distinct).size() != distinct.size()) {
            throw ApiException.notFound("전표를 찾을 수 없습니다.");
        }
        Map<Long, VatInvoiceMark> found = repository.findAllById(distinct).stream()
                .collect(Collectors.toMap(VatInvoiceMark::getJournalEntryId, Function.identity()));
        return distinct.stream()
                .map(id -> found.computeIfAbsent(id, k -> repository.save(VatInvoiceMark.blank(k))))
                .toList();
    }

    private static MarkResponse toResponse(VatInvoiceMark m) {
        return new MarkResponse(m.getJournalEntryId(), m.getDocKind(), m.getDocKind().getDisplayName(),
                m.getProgress(), m.getProgress().getDisplayName());
    }
}
