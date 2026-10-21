package com.erp.inventory.adjustment;

import com.erp.inventory.project.ProjectService;
import com.erp.inventory.stock.StockService;
import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.inventory.item.Item;
import com.erp.inventory.stock.StockTransaction;
import com.erp.inventory.stock.StockTransactionType;
import com.erp.inventory.warehouse.Warehouse;
import com.erp.inventory.adjustment.dto.StockAdjustmentDtos;
import com.erp.inventory.adjustment.dto.StockAdjustmentDtos.AdjustmentResponse;
import com.erp.inventory.adjustment.dto.StockAdjustmentDtos.CreateAdjustmentRequest;
import com.erp.inventory.item.ItemRepository;
import com.erp.inventory.warehouse.WarehouseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import com.erp.inventory.adjustment.dto.StockAdjustmentDtos;

/**
 * 기타이동 — 자가사용·불량처리·재고조정.
 * 재고 증감은 StockService 가 소유한다(음수 재고 방지·수불 이력 기록). 여기서는 전표만 남긴다.
 */
@Service
@RequiredArgsConstructor
public class StockAdjustmentService {

    private final StockAdjustmentRepository adjustmentRepository;
    private final ProjectService projectService;
    private final ItemRepository itemRepository;
    private final WarehouseRepository warehouseRepository;
    private final StockService stockService;
    private final DocumentNoGenerator docNoGenerator;
    private final StocktakeRepository stocktakeRepository;
    private final StockAdjustmentHistoryRepository historyRepository;
    private final com.erp.common.history.ChangeHistoryService changeHistory;

    /** 거래이력조회(재고) 대상 글자 — 조정 줄(자가사용 · 불량처리 · 간편재고조정)과 실사. */
    public static final String HISTORY_TARGET = "STOCK_ADJUSTMENT";
    public static final String STOCKTAKE_HISTORY_TARGET = "STOCKTAKE";

    /** 거래이력조회 메뉴 글자 — 우리 유형 중 원본 메뉴검색에 없는 대체사용 · 폐기는 null(적지 않는다). */
    private static String historyMenu(StockAdjustment a) {
        return switch (a.getType()) {
            case SELF_USE -> "자가사용";
            case DEFECT -> "불량처리";
            case ADJUST -> a.getReason() != null && a.getReason().startsWith("단계별조정 ") ? "단계별조정전표" : "간편조정전표";
            default -> null;
        };
    }

    /** 전표(번호) 한 장의 행위를 한 줄 — 대상 id 는 첫 줄 행. */
    private void recordHistory(String action, List<StockAdjustment> rows) {
        if (rows.isEmpty()) return;
        StockAdjustment first = rows.get(0);
        String menu = historyMenu(first);
        if (menu == null) return;
        changeHistory.recordSlipByNo(HISTORY_TARGET, first.getId(), action,
                com.erp.common.history.ChangeHistoryService.SlipSnapshot.of(menu, first.getAdjustDate(), first.getAdjustNo(),
                        com.erp.common.history.ChangeHistoryService.itemSummary(first.getItem().getName(), first.getItem().getSpec(), rows.size())));
    }

    private void recordStocktake(String action, Stocktake t) {
        changeHistory.recordSlip(STOCKTAKE_HISTORY_TARGET, t.getId(), action,
                com.erp.common.history.ChangeHistoryService.SlipSnapshot.of("실사전표", t.getStocktakeDate(), t.getStocktakeNo(),
                        com.erp.common.history.ChangeHistoryService.itemSummary(t.getItem().getName(), t.getItem().getSpec(), 1)));
    }

    /**
     * 원본 [오천건이상조회] 와 같은 문턱. 이 위로는 눌러야 간다.
     *
     * <p>재고수불부(5천)·전표조회와 같은 수로 맞춘다 — 화면마다 다른 문턱을 두면
     * 사람이 어디서 잘리는지 외워야 한다.
     */
    public static final int LIST_PAGE_ROWS = 5000;

    /**
     * 기타이동 목록. 기간을 안 주면 전 기간이다.
     *
     * <p>기간 조건이 <b>아예 없었다.</b> 다섯 화면이 [금월] 을 물어 놓고 전체를 받아
     * 브라우저에서 걸렀다 — 열 때마다 4,797줄·1.7MB 를 내려보내고 그중 몇십 줄만 그렸다.
     *
     * @param all 참이면 문턱을 무시하고 전부 준다(화면의 [오천건이상조회]).
     */
    @Transactional(readOnly = true)
    public StockAdjustmentDtos.AdjustmentListResponse list(LocalDate from, LocalDate to, boolean all) {
        return list(from, to, all, null);
    }

    /**
     * 조정 목록. <b>유형을 주면 그 유형만</b> 센다.
     *
     * <p>다섯 화면이 한 파일을 쓰는데 여태 유형을 안 보내, 화면이 다 받아 놓고 브라우저에서
     * 걸렀다. 그러면 <b>문턱을 다른 유형이 먼저 채운다</b> — 자가사용 줄이 잘려 나가도
     * 화면은 그것을 모르고, [잘림] 표시조차 다섯을 합친 수에 대한 것이었다.
     */
    @Transactional(readOnly = true)
    public StockAdjustmentDtos.AdjustmentListResponse list(LocalDate from, LocalDate to, boolean all,
                                                           StockAdjustmentType type) {
        /* 안 준 쪽은 열어 둔다 — 널을 쿼리에 넘기면 PostgreSQL 이 형을 못 정한다. */
        LocalDate f = from != null ? from : LocalDate.of(1, 1, 1);
        LocalDate t = to != null ? to : LocalDate.of(9999, 12, 31);
        long totalRows = type == null ? adjustmentRepository.countByPeriod(f, t)
                : adjustmentRepository.countByPeriodAndType(f, t, type);
        boolean truncated = !all && totalRows > LIST_PAGE_ROWS;
        var page = truncated ? org.springframework.data.domain.PageRequest.of(0, LIST_PAGE_ROWS)
                : org.springframework.data.domain.Pageable.unpaged();
        List<StockAdjustment> found = type == null
                ? adjustmentRepository.findByPeriod(f, t, page)
                : adjustmentRepository.findByPeriodAndType(f, t, type, page);
        return new StockAdjustmentDtos.AdjustmentListResponse(
                found.stream().map(AdjustmentResponse::from).toList(), totalRows, truncated);
    }

    /**
     * 간편재고조정 — 재고조정(ADJUST)이면 <b>실사도 따로 한 장</b> 남긴다(원본 재고실사조회 '간편' 줄, 2026-10-12 실측).
     * 단계별재고조정의 반영은 실사가 이미 단계별 요청으로 있어 {@link #createWithoutStocktake} 를 쓴다.
     */
    @Transactional
    public AdjustmentResponse create(CreateAdjustmentRequest req, String username) {
        return create(req, username, true);
    }

    /** 단계별재고조정 반영 — 실사는 단계별 요청이 들고 있어 간편 실사를 따로 남기지 않는다. */
    @Transactional
    public AdjustmentResponse createWithoutStocktake(CreateAdjustmentRequest req, String username) {
        return create(req, username, false, null, 1);
    }

    /** 단계별재고실사 한 장의 조정 — 줄이 조정전표 한 장(같은 번호, 줄번호만 다름)을 쓴다(원본 26/10/20-1). */
    @Transactional
    public AdjustmentResponse createSlipLine(CreateAdjustmentRequest req, String username, String adjustNo, int lineNo) {
        return create(req, username, false, adjustNo, lineNo);
    }

    /** 다음 조정전표 번호(같은 일자 · 같은 유형 접두어의 마지막 다음). 실사 한 장을 고칠 때 옛 조정을 지우기 전에 받아 -2 로 간다. */
    @Transactional
    public String nextAdjustNo(StockAdjustmentType type, LocalDate date) {
        return docNoGenerator.next(type.getDocPrefix(), "stock_adjustments", "adjust_no", "adjust_date", date);
    }

    private AdjustmentResponse create(CreateAdjustmentRequest req, String username, boolean simpleStocktake) {
        return create(req, username, simpleStocktake, null, 1);
    }

    private AdjustmentResponse create(CreateAdjustmentRequest req, String username, boolean simpleStocktake,
                                      String sharedNo, int lineNo) {
        Item item = itemRepository.findById(req.itemId())
                .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + req.itemId()));
        Warehouse warehouse = warehouseRepository.findById(req.warehouseId())
                .orElseThrow(() -> ApiException.notFound("창고를 찾을 수 없습니다. id=" + req.warehouseId()));

        LocalDate date = req.adjustDate() != null ? req.adjustDate() : LocalDate.now();
        String adjustNo = sharedNo != null ? sharedNo
                : docNoGenerator.next(req.type().getDocPrefix(), "stock_adjustments", "adjust_no", "adjust_date", date);
        String note = req.type().getDisplayName() + " " + adjustNo
                + (req.reason() != null && !req.reason().isBlank() ? " (" + req.reason() + ")" : "");

        // 재고 부족·차이 없음은 StockService 가 예외로 막고, 전표까지 함께 롤백된다.
        StockTransaction tx = switch (req.type()) {
            case SELF_USE, DEFECT, SUBSTITUTE, DISPOSAL -> {
                BigDecimal qty = required(req.quantity(), "차감할 수량을 입력하세요.");
                if (qty.signum() <= 0) {
                    throw ApiException.badRequest("수량은 0보다 커야 합니다.");
                }
                /*
                 * 수량관리제외 품목은 applyDelta 가 아무것도 안 하고 null 을 돌려준다 — 그대로 두면 아래
                 * tx.getBalanceAfter() 에서 500 이 났다(불량처리·자가사용·대체사용·폐기). 재고조정(adjustTo)과 같이 거절한다.
                 */
                stockService.requireStockTracked(item);
                yield stockService.applyDelta(item, warehouse, qty.negate(),
                        StockTransactionType.OUTBOUND, null, date, note, username);
            }
            case ADJUST -> stockService.adjustTo(item, warehouse,
                    required(req.actualQty(), "실사수량을 입력하세요."), date, note, username);
        };

        StockAdjustment adjustment = StockAdjustment.builder()
                .adjustNo(adjustNo)
                .lineNo(lineNo)
                .adjustDate(date)
                .type(req.type())
                .item(item)
                .warehouse(warehouse)
                /*
                 * 재고조정의 조정 전·후는 <b>실사일 재고</b>다 — 지난 날짜 실사면 현재고가 아니다(QA 55회차).
                 * 실사수량이 곧 조정 후이고, 조정 전은 거기서 차이를 뺀 것이다.
                 */
                .beforeQty(req.type() == StockAdjustmentType.ADJUST
                        ? req.actualQty().subtract(tx.getQuantityChange())
                        : tx.getBalanceAfter().subtract(tx.getQuantityChange()))
                .quantityChange(tx.getQuantityChange())
                .afterQty(req.type() == StockAdjustmentType.ADJUST ? req.actualQty() : tx.getBalanceAfter())
                .project(req.projectId() == null ? null : projectService.get(req.projectId()))
                .employeeId(req.employeeId())
                .reason(req.reason())
                .kind(req.kind())
                .handling(req.handling())
                .createdBy(username)
                .build();
        StockAdjustment saved = adjustmentRepository.save(adjustment);
        logHistory(saved, "신규", username);
        if (simpleStocktake) recordHistory(com.erp.common.history.ChangeHistoryService.CREATED, List.of(saved));
        if (simpleStocktake && req.type() == StockAdjustmentType.ADJUST) {
            Stocktake st = stocktakeRepository.save(Stocktake.builder()
                    .stocktakeNo(docNoGenerator.next("ST-", "stocktakes", "stocktake_no", "stocktake_date", date))
                    .stocktakeDate(date)
                    .warehouse(warehouse)
                    .item(item)
                    .actualQty(req.actualQty())
                    .employeeId(req.employeeId())
                    .adjustment(saved)
                    .createdBy(username)
                    .build());
            recordStocktake(com.erp.common.history.ChangeHistoryService.CREATED, st);
        }
        return AdjustmentResponse.from(saved);
    }

    /** 원본 재고실사조회의 '간편' 줄 — 기간 안 간편 실사. */
    @Transactional(readOnly = true)
    public List<StockAdjustmentDtos.StocktakeResponse> listStocktakes(LocalDate from, LocalDate to) {
        LocalDate f = from != null ? from : LocalDate.of(1, 1, 1);
        LocalDate t = to != null ? to : LocalDate.of(9999, 12, 31);
        return stocktakeRepository.findByPeriod(f, t).stream().map(StockAdjustmentDtos.StocktakeResponse::from).toList();
    }

    /**
     * 원본 재고실사조회 [선택삭제] — 실사를 지우면 <b>그 실사로 맞춘 재고조정도 같이 지워지고 재고가 되돌아온다</b>
     * (2026-10-13 loginaa 실측: 포장김치 본사창고 348 → 실사 350 간편재고조정, 재고실사조회에서 실사를 선택삭제하니
     * 재고조정조회의 '간편 · 26/10/13-1 · -2' 가 사라지고 간편재고조정 창의 재고가 다시 348).
     * 반대로 조정만 지우면 실사는 [조정전표] 빈 채로 남는다(2026-10-12 실측 — ON DELETE SET NULL).
     */
    @Transactional
    public void deleteStocktake(Long id, String username) {
        Stocktake s = stocktakeRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("재고실사를 찾을 수 없습니다. id=" + id));
        StockAdjustment a = s.getAdjustment();
        recordStocktake(com.erp.common.history.ChangeHistoryService.DELETED, s);
        stocktakeRepository.delete(s);
        stocktakeRepository.flush();
        if (a != null) delete(a.getId(), username);
    }

    /**
     * 재고조정·자가사용·불량·대체·폐기 삭제. 예전엔 지울 길이 없어서, 잘못 넣으면 반대로 한 번 더 넣는
     * 수밖에 없었다(QA 10회차) — 창고이동이 그랬던 것과 같다(StockTransferService.delete).
     *
     * <p>바뀐 수량을 반대로 되돌리고 수불이력은 지우지 않고 반대 거래를 남긴다. 되돌릴 재고가 모자라면
     * (조정으로 늘린 뒤 이미 나갔으면) applyDelta 가 막는다.
     */
    @Transactional
    public void delete(Long id, String username) {
        StockAdjustment a = adjustmentRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("재고조정을 찾을 수 없습니다. id=" + id));
        revert(a, username);
        logHistory(a, "삭제", username);
        recordHistory(com.erp.common.history.ChangeHistoryService.DELETED, List.of(a));
        adjustmentRepository.delete(a);
    }

    /**
     * 원본 재고조정조회 [이력조회 ▴] 의 한 줄을 남긴다 — 재고조정(ADJUST)만(자가사용 · 불량처리 등은 그 화면 몫).
     * 단계별재고조정이 만든 조정은 적요가 '단계별조정 ' 으로 시작한다(StagedStockAdjustmentService).
     */
    private void logHistory(StockAdjustment a, String action, String username) {
        if (a.getType() != StockAdjustmentType.ADJUST) return;
        String spec = a.getItem().getSpec();
        historyRepository.save(StockAdjustmentHistory.builder()
                .adjustNo(a.getAdjustNo())
                .adjustDate(a.getAdjustDate())
                .sort(a.getReason() != null && a.getReason().startsWith("단계별조정 ") ? "단계별" : "간편")
                .action(action)
                .itemLabel(a.getItem().getName() + (spec == null || spec.isBlank() ? "" : " [" + spec + "]"))
                .partnerId(a.getPartnerId())
                .employeeId(a.getEmployeeId())
                .worker(username)
                .workedAt(java.time.LocalDateTime.now())
                .build());
    }

    /** [이력조회 ▴] 간편조정 이력조회 · 단계별조정 이력조회 — 작업일자 구간, 최근 것부터. */
    @Transactional(readOnly = true)
    public List<StockAdjustmentDtos.HistoryRow> histories(String sort, LocalDate from, LocalDate to) {
        return historyRepository.findBySortAndWorkedAtBetweenOrderByWorkedAtDescIdDesc(
                        sort, from.atStartOfDay(), to.plusDays(1).atStartOfDay().minusNanos(1))
                .stream().map(StockAdjustmentDtos.HistoryRow::from).toList();
    }

    /**
     * 원본 <b>자가사용입력</b>(E040503) — 품목 여러 줄을 전표 한 장으로. 줄마다 그 창고 재고를 수량만큼 뺀다.
     *
     * <p>2026-10-12 loginaa 실측: 머리 [일자 · 거래처 · 담당자 · 창고 · 프로젝트], 격자 [품목코드 · 품목명 · 규격 · 수량 · 사용유형].
     * 창고를 비우고 저장하면 창고 칸이 빨갛게 막힌다. 저장하면 같은 일자 · 창고를 둔 채 격자만 비운다.
     * 재고조정(ADJUST)은 실사수량을 받는 다른 화면이라 여기로 받지 않는다.
     */
    @Transactional
    public StockAdjustmentDtos.SlipResponse createSlip(StockAdjustmentDtos.SlipRequest req, String username) {
        LocalDate date = req.date() != null ? req.date() : LocalDate.now();
        String adjustNo = docNoGenerator.next(req.type().getDocPrefix(), "stock_adjustments", "adjust_no", "adjust_date", date);
        StockAdjustmentDtos.SlipResponse out = writeSlip(adjustNo, date, req, username);
        recordHistory(com.erp.common.history.ChangeHistoryService.CREATED, slipRows(adjustNo));
        return out;
    }

    @Transactional(readOnly = true)
    public StockAdjustmentDtos.SlipResponse getSlip(String adjustNo) {
        return StockAdjustmentDtos.SlipResponse.of(slipRows(adjustNo));
    }

    /**
     * 자가사용수정 — 원본처럼 <b>일자는 그대로</b> 두고(수정 창의 일자가 잠긴다) 나머지를 새로 쓴다.
     * 예전 줄이 뺀 재고를 되돌린 뒤 새 줄을 다시 뺀다. 둘 다 한 트랜잭션이라 새 줄이 재고 부족으로
     * 막히면 되돌린 것까지 함께 취소된다.
     */
    @Transactional
    public StockAdjustmentDtos.SlipResponse updateSlip(String adjustNo, StockAdjustmentDtos.SlipRequest req, String username) {
        List<StockAdjustment> old = slipRows(adjustNo);
        LocalDate date = old.get(0).getAdjustDate();
        withdrawSlip(old, username);
        adjustmentRepository.deleteAll(old);
        /* Hibernate 는 flush 때 insert 를 delete 보다 먼저 보낸다 — 같은 (번호, 줄번호)로 다시 넣으면 유일 제약에 걸린다. */
        adjustmentRepository.flush();
        StockAdjustmentDtos.SlipResponse out = writeSlip(adjustNo, date, req, username);
        recordHistory(com.erp.common.history.ChangeHistoryService.UPDATED, slipRows(adjustNo));
        return out;
    }

    /** 원본 자가사용수정의 [삭제] — '전표를 삭제하겠습니까?' 뒤 전표의 모든 줄을 지우고 재고를 되돌린다. */
    @Transactional
    public void deleteSlip(String adjustNo, String username) {
        List<StockAdjustment> rows = slipRows(adjustNo);
        withdrawSlip(rows, username);
        recordHistory(com.erp.common.history.ChangeHistoryService.DELETED, rows);
        adjustmentRepository.deleteAll(rows);
    }

    private List<StockAdjustment> slipRows(String adjustNo) {
        List<StockAdjustment> rows = adjustmentRepository.findSlip(adjustNo);
        if (rows.isEmpty()) {
            throw ApiException.notFound("전표를 찾을 수 없습니다. " + adjustNo);
        }
        return rows;
    }

    private StockAdjustmentDtos.SlipResponse writeSlip(String adjustNo, LocalDate date,
                                                      StockAdjustmentDtos.SlipRequest req, String username) {
        if (req.type() == StockAdjustmentType.ADJUST) {
            throw ApiException.badRequest("재고조정은 실사수량으로 입력하세요.");
        }
        Warehouse warehouse = warehouseRepository.findById(req.warehouseId())
                .orElseThrow(() -> ApiException.notFound("창고를 찾을 수 없습니다. id=" + req.warehouseId()));
        var project = req.projectId() == null ? null : projectService.get(req.projectId());
        boolean substitute = req.type() == StockAdjustmentType.DEFECT && HANDLING_SUBSTITUTE.equals(req.handling());
        boolean normalUse = req.type() == StockAdjustmentType.DEFECT && HANDLING_NORMAL_USE.equals(req.handling());
        List<StockAdjustmentDtos.SlipLine> defective = req.lines().stream().filter(l -> !Boolean.TRUE.equals(l.normal())).toList();
        if (defective.isEmpty()) {
            throw ApiException.badRequest("불량품목을 입력하세요.");
        }
        if (!substitute && defective.size() != req.lines().size()) {
            throw ApiException.badRequest("정상품목은 처리방법이 품목대체일 때만 넣을 수 있습니다.");
        }
        List<StockAdjustment> saved = new java.util.ArrayList<>();
        int lineNo = 0;
        /* 불량품목은 발견창고에서 나간다(폐기 · 품목대체 · 정상사용 모두). */
        for (StockAdjustmentDtos.SlipLine line : defective) {
            saved.add(writeLine(++lineNo, adjustNo, date, req, warehouse, project, line, false, username));
        }
        /*
         * 품목대체의 [정상품목]은 발견창고로 들어온다. 정상사용은 원본이 같은 품목을 '[불량] - 정상사용' 으로
         * 출고 1 · 입고 1 두 줄을 남겨 재고가 그대로다(2026-10-12 실측: 포장김치 799 → 800 → … 출고 · 입고 한 쌍)
         * — 우리도 나간 줄마다 같은 수량이 들어오는 정상품목 줄을 붙인다.
         */
        List<StockAdjustmentDtos.SlipLine> incoming = substitute
                ? req.lines().stream().filter(l -> Boolean.TRUE.equals(l.normal())).toList()
                : normalUse ? defective : List.of();
        for (StockAdjustmentDtos.SlipLine line : incoming) {
            saved.add(writeLine(++lineNo, adjustNo, date, req, warehouse, project, line, true, username));
        }
        return StockAdjustmentDtos.SlipResponse.of(saved);
    }

    /** 원본 불량처리입력 [처리방법] 값. */
    static final String HANDLING_SUBSTITUTE = "품목대체";
    static final String HANDLING_NORMAL_USE = "정상사용";

    /** 전표 한 줄 — 나가는 줄(inbound=false)은 재고를 빼고, 들어오는 줄은 더한다. */
    private StockAdjustment writeLine(int lineNo, String adjustNo, LocalDate date, StockAdjustmentDtos.SlipRequest req,
                                      Warehouse warehouse, com.erp.inventory.project.Project project,
                                      StockAdjustmentDtos.SlipLine line, boolean inbound, String username) {
        Item item = itemRepository.findById(line.itemId())
                .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + line.itemId()));
        BigDecimal qty = line.quantity();
        if (qty.signum() <= 0) {
            throw ApiException.badRequest(lineNo + "번째 줄: 수량은 0보다 커야 합니다.");
        }
        stockService.requireStockTracked(item);
        String note = slipNote(req.type(), adjustNo, req.handling(), line.reason());
        StockTransaction tx = stockService.applyDelta(item, warehouse, inbound ? qty : qty.negate(),
                inbound ? StockTransactionType.INBOUND : StockTransactionType.OUTBOUND, null, date, note, username);
        return adjustmentRepository.save(StockAdjustment.builder()
                .adjustNo(adjustNo)
                .lineNo(lineNo)
                .adjustDate(date)
                .type(req.type())
                .item(item)
                .warehouse(warehouse)
                .beforeQty(tx.getBalanceAfter().subtract(tx.getQuantityChange()))
                .quantityChange(tx.getQuantityChange())
                .afterQty(tx.getBalanceAfter())
                .project(project)
                .employeeId(req.employeeId())
                .partnerId(req.partnerId())
                .reason(line.reason())
                .kind(line.kind())
                .handling(req.handling())
                .createdBy(username)
                .build());
    }

    /** 자가사용 · 불량처리 전표 줄이 수불부에 남기는 적요 — 고치거나 지울 때 이것으로 그 줄을 찾아 거둔다. */
    private static String slipNote(StockAdjustmentType type, String adjustNo, String handling, String reason) {
        return type.getDisplayName() + " " + adjustNo
                + (handling != null && !handling.isBlank() ? " - " + handling : "")
                + (reason != null && !reason.isBlank() ? " (" + reason + ")" : "");
    }

    /**
     * 자가사용 · 불량처리 전표를 고치거나 지울 때 그 전표의 수불 줄을 <b>거둔다</b>(StockService.withdraw).
     *
     * <p>원본 자가사용은 밀키스 2 → 3 으로 고치면 재고수불부에 '[자가] 출고 3' <b>한 줄</b>만 남고, 지우면 줄이 사라진다
     * (2026-10-21 loginaa 실측). 예전엔 반대 거래를 쌓아 같은 전표가 출고 · 입고 · 출고 세 줄로 남았다.
     * 줄 행은 재고 거래보다 조금 뒤에 저장되므로 처음 쓴 때에서 몇 초 앞부터 본다. 거둘 줄을 못 찾은
     * 옛 자료(적요 꼴이 다른 것)는 예전처럼 반대 거래로 되돌린다 — 잔량이 어긋나지 않게.
     */
    private void withdrawSlip(List<StockAdjustment> rows, String username) {
        java.util.Set<String> done = new java.util.HashSet<>();
        for (StockAdjustment a : rows) {
            String note = slipNote(a.getType(), a.getAdjustNo(), a.getHandling(), a.getReason());
            if (done.contains(note)) {
                continue;
            }
            java.time.LocalDateTime since = a.getCreatedAt() != null
                    ? a.getCreatedAt().minusSeconds(5) : java.time.LocalDateTime.of(1900, 1, 1, 0, 0);
            if (stockService.withdraw(note, since) > 0) {
                done.add(note);
            } else {
                revert(a, username);
            }
        }
    }

    /** 한 줄이 바꾼 재고를 되돌린다(수불이력은 지우지 않고 반대 거래를 남긴다). */
    private void revert(StockAdjustment a, String username) {
        BigDecimal back = a.getQuantityChange().negate();
        if (back.signum() != 0) {
            StockTransactionType type = a.getType() == StockAdjustmentType.ADJUST ? StockTransactionType.ADJUST
                    : back.signum() > 0 ? StockTransactionType.INBOUND : StockTransactionType.OUTBOUND;
            stockService.applyDelta(a.getItem(), a.getWarehouse(), back, type, null, a.getAdjustDate(),
                    a.getType().getDisplayName() + "취소 " + a.getAdjustNo(), username);
        }
    }

    private BigDecimal required(BigDecimal value, String message) {
        if (value == null) {
            throw ApiException.badRequest(message);
        }
        return value;
    }
}
