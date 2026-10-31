package com.erp.accounting.promissorynote;

import com.erp.accounting.promissorynote.dto.PromissoryNoteDtos.CreateNoteRequest;
import com.erp.accounting.promissorynote.dto.PromissoryNoteDtos.DiscountRequest;
import com.erp.accounting.promissorynote.dto.PromissoryNoteDtos.DishonorRequest;
import com.erp.accounting.promissorynote.dto.PromissoryNoteDtos.NoteResponse;
import com.erp.accounting.promissorynote.dto.PromissoryNoteDtos.NoteSummary;
import com.erp.accounting.promissorynote.dto.PromissoryNoteDtos.SettleRequest;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import com.erp.accounting.promissorynote.dto.PromissoryNoteDtos;

/** 어음거래 (회계 I). 받을어음 수취 / 지급어음 발행 → 만기결제·할인·부도. */
@RestController
@RequestMapping("/api/notes")
@RequiredArgsConstructor
public class PromissoryNoteController {

    private final PromissoryNoteService service;

    @GetMapping
    public NoteSummary list(
            /* 화면 조건 판의 [기간] — 안 주면 전 기간이다. */
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate from,
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate to,
            /* 원본 [오천건이상조회] — 눌러야 문턱 위를 준다. */
            @RequestParam(required = false, defaultValue = "false") boolean all) {
        return service.findAll(from, to, all);
    }

    @PostMapping
    public ResponseEntity<NoteResponse> create(
            @Valid @RequestBody CreateNoteRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.create(req, principal.getUsername()));
    }

    /** 받을어음증가 · 지급어음증가 수정(원본 조회 증가 줄 [일자] → 수정 창). */
    @PutMapping("/{id}")
    public ResponseEntity<NoteResponse> updateIssue(
            @PathVariable Long id,
            @Valid @RequestBody CreateNoteRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.updateIssue(id, req, principal.getUsername()));
    }

    /** 만기결제 (계좌 입출금 + 분개) */
    @PostMapping("/{id}/settle")
    public NoteResponse settle(@PathVariable Long id, @Valid @RequestBody SettleRequest req,
                               @AuthenticationPrincipal UserPrincipal principal) {
        return service.settle(id, req, principal.getUsername());
    }

    /** 어음할인 (받을어음 전용) */
    @PostMapping("/{id}/discount")
    public NoteResponse discount(@PathVariable Long id, @Valid @RequestBody DiscountRequest req,
                                 @AuthenticationPrincipal UserPrincipal principal) {
        return service.discount(id, req, principal.getUsername());
    }

    /** 원본 [내역만등록] 전표구분 [감소] — 분개 없이 닫는다 */
    @PostMapping("/record-decrease")
    public NoteResponse recordDecrease(@Valid @RequestBody com.erp.accounting.promissorynote.dto.PromissoryNoteDtos.RecordDecreaseRequest req) {
        return service.recordDecrease(req);
    }

    /** [내역만등록] 감소 줄 지우기 — 다시 보유로 */
    @DeleteMapping("/{id}/record-decrease")
    public NoteResponse cancelRecordDecrease(@PathVariable Long id) {
        return service.cancelRecordDecrease(id);
    }

    /** 삭제 — 보유 중인 어음만 */
    /** 받을어음감소(E010602) 한 장 — 분개 차) 입금계좌 · 이자비용 / 대) 받을어음 */
    @PostMapping("/decrease")
    public NoteResponse decrease(@Valid @RequestBody com.erp.accounting.promissorynote.dto.PromissoryNoteDtos.DecreaseRequest req,
                                 @AuthenticationPrincipal UserPrincipal principal) {
        return service.decrease(req, principal.getUsername());
    }

    /** 받을어음감소 수정 창 [저장(F8)] */
    @PutMapping("/{id}/decrease")
    public NoteResponse updateDecrease(@PathVariable Long id,
                                       @Valid @RequestBody com.erp.accounting.promissorynote.dto.PromissoryNoteDtos.DecreaseRequest req,
                                       @AuthenticationPrincipal UserPrincipal principal) {
        return service.updateDecrease(id, req, principal.getUsername());
    }

    /** 받을어음감소 지우기(원본 '전표를 삭제하겠습니까? - 받을어음감소') — 전표를 지우고 입금을 되돌려 어음을 보유로 */
    @DeleteMapping("/{id}/decrease")
    public NoteResponse cancelDecrease(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        return service.cancelDecrease(id, principal.getUsername());
    }

    /** 받을어음거래처지급(E010603) 한 장 — 분개 차) 외상매입금 / 대) 받을어음 */
    @PostMapping("/endorse")
    public NoteResponse endorse(@Valid @RequestBody PromissoryNoteDtos.EndorseRequest req,
                                @AuthenticationPrincipal UserPrincipal principal) {
        return service.endorse(req, principal.getUsername());
    }

    /** 거래처지급 수정 창 [저장(F8)] */
    @PutMapping("/{id}/endorse")
    public NoteResponse updateEndorse(@PathVariable Long id, @Valid @RequestBody PromissoryNoteDtos.EndorseRequest req,
                                      @AuthenticationPrincipal UserPrincipal principal) {
        return service.updateEndorse(id, req, principal.getUsername());
    }

    /** 거래처지급 지우기 — 전표를 지우고 어음을 보유로 */
    @DeleteMapping("/{id}/endorse")
    public NoteResponse cancelEndorse(@PathVariable Long id) {
        return service.cancelEndorse(id);
    }

    /** 받을어음일괄감소 [입금보고서작성] → 입금보고서 [저장] — 회계전표(입금보고서) + 고른 어음 감소 */
    @PostMapping("/deposit-report")
    public java.util.List<NoteResponse> depositReport(@Valid @RequestBody PromissoryNoteDtos.VoucherReportRequest req,
                                                      @AuthenticationPrincipal UserPrincipal principal) {
        return service.voucherReport(NoteType.RECEIVABLE, req, principal.getUsername());
    }

    /** 지급어음일괄감소 [지출결의서작성] → 지출결의서 [저장] — 회계전표(지출결의서) + 고른 어음 감소 */
    @PostMapping("/withdraw-report")
    public java.util.List<NoteResponse> withdrawReport(@Valid @RequestBody PromissoryNoteDtos.VoucherReportRequest req,
                                                       @AuthenticationPrincipal UserPrincipal principal) {
        return service.voucherReport(NoteType.PAYABLE, req, principal.getUsername());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    /** 부도 처리 (받을어음 전용) */
    @PostMapping("/{id}/dishonor")
    public NoteResponse dishonor(@PathVariable Long id, @Valid @RequestBody(required = false) DishonorRequest req) {
        return service.dishonor(id, req);
    }
}
