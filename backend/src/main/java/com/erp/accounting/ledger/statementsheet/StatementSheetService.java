package com.erp.accounting.ledger.statementsheet;

import com.erp.accounting.ledger.statementsheet.dto.StatementSheetDtos.SaveLinesRequest;
import com.erp.accounting.ledger.statementsheet.dto.StatementSheetDtos.SaveSheetRequest;
import com.erp.accounting.ledger.statementsheet.dto.StatementSheetDtos.SheetLine;
import com.erp.accounting.ledger.statementsheet.dto.StatementSheetDtos.SheetResponse;
import com.erp.common.ApiException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 현금흐름표 · 이익잉여금처분계산서 — 회계기수 한 장씩 저장(원본 [신규(F2)] · [입력] · [삭제]). */
@Service
@RequiredArgsConstructor
public class StatementSheetService {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<List<SheetLine>> LINES = new TypeReference<>() {};

    private final StatementSheetRepository repository;

    @Transactional(readOnly = true)
    public List<SheetResponse> list(StatementSheetKind kind) {
        return repository.findByKindOrderByTermNoDescIdDesc(kind).stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public SheetResponse get(Long id) {
        return toResponse(find(id));
    }

    @Transactional
    public SheetResponse create(SaveSheetRequest req) {
        validatePeriod(req);
        StatementSheet s = StatementSheet.builder()
                .kind(req.kind()).termNo(req.termNo()).fromYm(req.fromYm()).toYm(req.toYm())
                .settleDate(req.settleDate()).allItems(req.allItems() == null || req.allItems())
                .build();
        return toResponse(repository.save(s));
    }

    @Transactional
    public SheetResponse update(Long id, SaveSheetRequest req) {
        validatePeriod(req);
        StatementSheet s = find(id);
        s.setTermNo(req.termNo());
        s.setFromYm(req.fromYm());
        s.setToYm(req.toYm());
        s.setSettleDate(req.settleDate());
        s.setAllItems(req.allItems() == null || req.allItems());
        return toResponse(s);
    }

    @Transactional
    public SheetResponse saveLines(Long id, SaveLinesRequest req) {
        StatementSheet s = find(id);
        try {
            s.setLinesJson(JSON.writeValueAsString(req.lines()));
        } catch (JsonProcessingException e) {
            throw ApiException.badRequest("항목을 저장할 수 없습니다.");
        }
        if (req.settleDate() != null) s.setSettleDate(req.settleDate());
        return toResponse(s);
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(find(id));
    }

    private void validatePeriod(SaveSheetRequest req) {
        if (req.fromYm().compareTo(req.toYm()) > 0) {
            throw ApiException.badRequest("기간을 확인 바랍니다.");
        }
    }

    private StatementSheet find(Long id) {
        return repository.findById(id).orElseThrow(() -> ApiException.notFound("자료가 없습니다."));
    }

    private SheetResponse toResponse(StatementSheet s) {
        List<SheetLine> lines;
        try {
            lines = JSON.readValue(s.getLinesJson() == null ? "[]" : s.getLinesJson(), LINES);
        } catch (JsonProcessingException e) {
            lines = List.of();
        }
        return new SheetResponse(s.getId(), s.getKind(), s.getTermNo(), s.getFromYm(), s.getToYm(),
                s.getSettleDate(), s.isAllItems(), lines);
    }
}
