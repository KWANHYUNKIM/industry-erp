package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.User;
import com.erp.domain.UserNote;
import com.erp.dto.WorkspaceDtos.Notification;
import com.erp.dto.WorkspaceDtos.NotificationResponse;
import com.erp.dto.WorkspaceDtos.NoteRequest;
import com.erp.dto.WorkspaceDtos.NoteResponse;
import com.erp.dto.WorkspaceDtos.SearchGroup;
import com.erp.dto.WorkspaceDtos.SearchHit;
import com.erp.dto.WorkspaceDtos.SearchResponse;
import com.erp.repository.UserNoteRepository;
import com.erp.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * 우측 앱바 위젯 — 통합검색 · 알림 · E Note.
 *
 * 검색·알림은 다른 모듈의 공개 service 만 거쳐 읽는다(리포지토리를 직접 주입하지 않는다).
 * 각 결과에는 이동할 화면 경로를 같이 실어, 클릭하면 그 화면으로 바로 간다.
 */
@Service
@RequiredArgsConstructor
public class WorkspaceService {

    /** 종류별로 최대 몇 건까지 보여 줄지 */
    private static final int LIMIT = 5;

    /** 계약 만료가 며칠 안으로 다가오면 알릴지 */
    private static final int CONTRACT_WARN_DAYS = 30;

    private final ItemService itemService;
    private final PartnerService partnerService;
    private final SalesService salesService;
    private final PurchaseService purchaseService;
    private final SalesOrderService salesOrderService;
    private final StockService stockService;
    private final ApprovalService approvalService;
    private final BusinessContractService contractService;
    private final UserNoteRepository noteRepository;
    private final UserRepository userRepository;

    // ── 통합검색 ──────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public SearchResponse search(String keyword) {
        if (keyword == null || keyword.isBlank()) {
            throw ApiException.badRequest("검색어를 입력하세요.");
        }
        String q = keyword.trim().toLowerCase(Locale.ROOT);
        List<SearchGroup> groups = new ArrayList<>();

        addGroup(groups, "ITEM", "품목",
                itemService.findAll().stream()
                        .filter(i -> contains(i.code(), q) || contains(i.name(), q))
                        .map(i -> new SearchHit(i.code() + " " + i.name(),
                                i.spec() != null ? i.spec() : i.unit(), "/inventory/items"))
                        .toList());

        addGroup(groups, "PARTNER", "거래처",
                partnerService.findAll().stream()
                        .filter(p -> contains(p.code(), q) || contains(p.name(), q))
                        .map(p -> new SearchHit(p.code() + " " + p.name(),
                                p.typeName(), "/sales/partners"))
                        .toList());

        addGroup(groups, "SALES", "판매전표",
                salesService.findAll().stream()
                        .filter(s -> contains(s.docNo(), q) || contains(s.partnerName(), q))
                        .map(s -> new SearchHit(s.docNo(),
                                s.saleDate() + " · " + s.partnerName(), "/sales/sales-list"))
                        .toList());

        addGroup(groups, "PURCHASE", "구매전표",
                purchaseService.findAll().stream()
                        .filter(p -> contains(p.docNo(), q) || contains(p.partnerName(), q))
                        .map(p -> new SearchHit(p.docNo(),
                                p.purchaseDate() + " · " + p.partnerName(), "/sales/purchase-list"))
                        .toList());

        addGroup(groups, "SALES_ORDER", "수주",
                salesOrderService.findAll().stream()
                        .filter(o -> contains(o.orderNo(), q) || contains(o.partnerName(), q))
                        .map(o -> new SearchHit(o.orderNo(),
                                o.orderDate() + " · " + o.partnerName() + " · " + o.statusName(), "/sales/orders"))
                        .toList());

        int total = groups.stream().mapToInt(SearchGroup::total).sum();
        return new SearchResponse(keyword.trim(), total, groups);
    }

    /** 결과가 있는 종류만 담고, 화면에는 앞의 LIMIT 건만 보여 준다(총 건수는 그대로 알려 준다) */
    private void addGroup(List<SearchGroup> groups, String type, String typeName, List<SearchHit> hits) {
        if (hits.isEmpty()) {
            return;
        }
        groups.add(new SearchGroup(type, typeName, hits.size(), hits.stream().limit(LIMIT).toList()));
    }

    private boolean contains(String value, String q) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(q);
    }

    // ── 알림 ──────────────────────────────────────────────────────────

    /** 지금 손봐야 할 일만 모은다. 아무 일도 없으면 빈 목록이다. */
    @Transactional(readOnly = true)
    public NotificationResponse notifications(String username) {
        List<Notification> list = new ArrayList<>();

        int myApprovals = approvalService.list("pending", username, false).size();
        if (myApprovals > 0) {
            list.add(new Notification("APPROVAL", "INFO", "결재 대기",
                    "내가 결재할 차례인 문서가 " + myApprovals + "건 있습니다.",
                    myApprovals, "/groupware/approval/my"));
        }

        long belowSafety = stockService.currentStock().stream()
                .filter(s -> Boolean.TRUE.equals(s.belowSafety()))
                .count();
        if (belowSafety > 0) {
            list.add(new Notification("SAFETY_STOCK", "WARN", "안전재고 미달",
                    "안전재고보다 적은 품목이 " + belowSafety + "건 있습니다.",
                    (int) belowSafety, "/inventory/current"));
        }

        int unshipped = salesOrderService.findUnshipped().size();
        if (unshipped > 0) {
            list.add(new Notification("UNSHIPPED", "INFO", "미출고 수주",
                    "아직 출고하지 않은 수주 라인이 " + unshipped + "건 있습니다.",
                    unshipped, "/sales/unshipped"));
        }

        LocalDate today = LocalDate.now();
        long expiring = contractService.findAll().stream()
                .filter(c -> "SIGNED".equals(c.status().name()))
                .filter(c -> {
                    long days = ChronoUnit.DAYS.between(today, c.endDate());
                    return days >= 0 && days <= CONTRACT_WARN_DAYS;
                })
                .count();
        if (expiring > 0) {
            list.add(new Notification("CONTRACT", "WARN", "계약 만료임박",
                    CONTRACT_WARN_DAYS + "일 안에 만료되는 계약이 " + expiring + "건 있습니다.",
                    (int) expiring, "/accounting/contracts"));
        }

        return new NotificationResponse(list.size(), list);
    }

    // ── E Note (개인 메모) ────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<NoteResponse> notes(String username) {
        return noteRepository.findByOwner_UsernameOrderByPinnedDescUpdatedAtDesc(username).stream()
                .map(NoteResponse::from)
                .toList();
    }

    @Transactional
    public NoteResponse createNote(NoteRequest req, String username) {
        User owner = userRepository.findByUsername(username)
                .orElseThrow(() -> ApiException.notFound("사용자를 찾을 수 없습니다: " + username));
        UserNote n = UserNote.builder()
                .owner(owner)
                .content(req.content())
                .pinned(req.pinned() != null && req.pinned())
                .build();
        return NoteResponse.from(noteRepository.save(n));
    }

    /** 남의 메모는 보이지도, 고쳐지지도 않는다 — 조회 자체를 소유자로 건다. */
    @Transactional
    public NoteResponse updateNote(Long id, NoteRequest req, String username) {
        UserNote n = note(id, username);
        n.setContent(req.content());
        n.setPinned(req.pinned() != null ? req.pinned() : n.isPinned());
        return NoteResponse.from(n);
    }

    @Transactional
    public void deleteNote(Long id, String username) {
        noteRepository.delete(note(id, username));
    }

    private UserNote note(Long id, String username) {
        return noteRepository.findByIdAndOwner_Username(id, username)
                .orElseThrow(() -> ApiException.notFound("메모를 찾을 수 없습니다. id=" + id));
    }
}
