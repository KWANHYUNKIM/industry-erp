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

    @Transactional
    public AdjustmentResponse create(CreateAdjustmentRequest req, String username) {
        Item item = itemRepository.findById(req.itemId())
                .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + req.itemId()));
        Warehouse warehouse = warehouseRepository.findById(req.warehouseId())
                .orElseThrow(() -> ApiException.notFound("창고를 찾을 수 없습니다. id=" + req.warehouseId()));

        LocalDate date = req.adjustDate() != null ? req.adjustDate() : LocalDate.now();
        String adjustNo = docNoGenerator.next("SA-", "stock_adjustments", "adjust_no", "adjust_date", date);
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
        return AdjustmentResponse.from(adjustmentRepository.save(adjustment));
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
        BigDecimal back = a.getQuantityChange().negate();
        if (back.signum() != 0) {
            StockTransactionType type = a.getType() == StockAdjustmentType.ADJUST ? StockTransactionType.ADJUST
                    : back.signum() > 0 ? StockTransactionType.INBOUND : StockTransactionType.OUTBOUND;
            stockService.applyDelta(a.getItem(), a.getWarehouse(), back, type, null, a.getAdjustDate(),
                    a.getType().getDisplayName() + "취소 " + a.getAdjustNo(), username);
        }
        adjustmentRepository.delete(a);
    }

    private BigDecimal required(BigDecimal value, String message) {
        if (value == null) {
            throw ApiException.badRequest(message);
        }
        return value;
    }
}
