package com.erp.inventory.transfer;

import com.erp.inventory.project.ProjectService;
import com.erp.inventory.stock.StockService;
import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.inventory.item.Item;
import com.erp.inventory.stock.StockTransactionType;
import com.erp.inventory.warehouse.Warehouse;
import com.erp.inventory.transfer.dto.StockTransferDtos.CreateTransferRequest;
import com.erp.inventory.transfer.dto.StockTransferDtos.TransferResponse;
import com.erp.inventory.item.ItemRepository;
import com.erp.inventory.warehouse.WarehouseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.erp.inventory.transfer.dto.StockTransferDtos.TransferLineRequest;
import com.erp.inventory.transfer.dto.StockTransferDtos.TransferSlipRequest;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import com.erp.inventory.transfer.dto.StockTransferDtos;

@Service
@RequiredArgsConstructor
public class StockTransferService {

    private final StockTransferRepository transferRepository;
    private final ProjectService projectService;
    private final ItemRepository itemRepository;
    private final WarehouseRepository warehouseRepository;
    private final StockService stockService;
    private final DocumentNoGenerator docNoGenerator;
    private final com.erp.common.history.ChangeHistoryService changeHistory;

    public static final String HISTORY_TARGET = "STOCK_TRANSFER";

    /** 거래이력조회(재고) 메뉴 '창고이동' 한 줄 — 전표(이동번호)의 첫 줄 행 id 가 대상이다. */
    private void recordHistory(String action, List<StockTransfer> rows) {
        StockTransfer first = rows.get(0);
        changeHistory.recordSlipByNo(HISTORY_TARGET, first.getId(), action,
                com.erp.common.history.ChangeHistoryService.SlipSnapshot.of("창고이동", first.getTransferDate(), first.getTransferNo(),
                        com.erp.common.history.ChangeHistoryService.itemSummary(first.getItem().getName(), first.getItem().getSpec(), rows.size())));
    }

    @Transactional(readOnly = true)
    public List<TransferResponse> findAll() {
        return findAll(null, null);
    }

    /**
     * 창고이동 목록. 기간을 주면 그만큼만 준다(안 주면 전 기간 — 예전 그대로다).
     *
     * <p>창고이동조회 조건 판에 [기간]을 물어 놓고 서버에는 아무것도 안 보내,
     * 전 기간을 받아 브라우저에서 걸렀다.
     */
    @Transactional(readOnly = true)
    public List<TransferResponse> findAll(LocalDate from, LocalDate to) {
        var found = (from == null && to == null)
                ? transferRepository.findAllWithRefs()
                : transferRepository.findWithRefsByPeriod(
                        from != null ? from : LocalDate.of(1, 1, 1),
                        to != null ? to : LocalDate.of(9999, 12, 31));
        return found.stream().map(TransferResponse::from).toList();
    }

    /** 창고 간 이동: 출고창고에서 차감(OUTBOUND) 후 입고창고에 가산(INBOUND). 한 트랜잭션으로 원자 처리. */
    @Transactional
    public TransferResponse create(CreateTransferRequest req, String username) {
        if (req.fromWarehouseId().equals(req.toWarehouseId())) {
            throw ApiException.badRequest("출고창고와 입고창고가 같을 수 없습니다.");
        }
        Item item = itemRepository.findById(req.itemId())
                .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + req.itemId()));
        Warehouse from = warehouseRepository.findById(req.fromWarehouseId())
                .orElseThrow(() -> ApiException.notFound("출고창고를 찾을 수 없습니다. id=" + req.fromWarehouseId()));
        Warehouse to = warehouseRepository.findById(req.toWarehouseId())
                .orElseThrow(() -> ApiException.notFound("입고창고를 찾을 수 없습니다. id=" + req.toWarehouseId()));

        LocalDate date = req.transferDate() != null ? req.transferDate() : LocalDate.now();
        String transferNo = generateNo(date);
        String note = "창고이동 " + transferNo + " (" + from.getName() + "→" + to.getName() + ")";

        // 출고창고 차감 (재고 부족 시 applyDelta 내부에서 예외 → 전체 롤백)
        stockService.applyDelta(item, from, req.quantity().negate(), StockTransactionType.OUTBOUND, null, date, note, username);
        // 입고창고 가산
        stockService.applyDelta(item, to, req.quantity(), StockTransactionType.INBOUND, null, date, note, username);

        StockTransfer transfer = StockTransfer.builder()
                .transferNo(transferNo)
                .lineNo(1)
                .transferDate(date)
                .item(item)
                .fromWarehouse(from)
                .toWarehouse(to)
                .quantity(req.quantity())
                .project(req.projectId() == null ? null : projectService.get(req.projectId()))
                .employeeId(req.employeeId())
                .reason(req.reason())
                .createdBy(username)
                .build();
        StockTransfer savedOne = transferRepository.save(transfer);
        recordHistory(com.erp.common.history.ChangeHistoryService.CREATED, List.of(savedOne));
        return TransferResponse.from(savedOne);
    }

    /**
     * 창고이동 취소.
     *
     * <p>이 자리가 <b>아예 없었다.</b> 판매·구매·자재불출·재고조정은 모두 지울 수 있는데
     * 창고이동만 없어서, 창고를 잘못 골라 옮기면 되돌릴 방법이 없었다. 화면에도 [삭제]가
     * 없어서 사람이 할 수 있는 일은 <b>반대로 한 번 더 옮기는 것</b>뿐인데, 그러면
     * 창고이동조회에 있지도 않은 이동이 두 줄 남는다.
     *
     * <p>되돌리는 방식은 바로 옆 자재불출과 같다 — 옮겼던 재고를 반대로 옮기고,
     * 수불이력은 지우지 않고 반대 거래를 남긴다. 이미 입고창고에서 빠져나간 뒤라
     * 되돌릴 재고가 모자라면 {@code applyDelta} 가 막는다(그 편이 맞다 — 없는 물건을
     * 되돌리는 척하면 재고가 음수가 된다).
     */
    @Transactional
    public void delete(Long id, String username) {
        StockTransfer t = transferRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("창고이동을 찾을 수 없습니다. id=" + id));

        String note = "창고이동취소 " + t.getTransferNo()
                + " (" + t.getFromWarehouse().getName() + "→" + t.getToWarehouse().getName() + ")";
        // 입고창고에서 빼고
        stockService.applyDelta(t.getItem(), t.getToWarehouse(), t.getQuantity().negate(),
                StockTransactionType.OUTBOUND, null, t.getTransferDate(), note, username);
        // 출고창고로 되돌린다
        stockService.applyDelta(t.getItem(), t.getFromWarehouse(), t.getQuantity(),
                StockTransactionType.INBOUND, null, t.getTransferDate(), note, username);

        recordHistory(com.erp.common.history.ChangeHistoryService.DELETED, List.of(t));
        transferRepository.delete(t);
    }

    /** 창고이동 전표 한 장(줄들). */
    @Transactional(readOnly = true)
    public List<TransferResponse> findSlip(String transferNo) {
        List<StockTransfer> lines = transferRepository.findSlip(transferNo);
        if (lines.isEmpty()) throw ApiException.notFound("창고이동을 찾을 수 없습니다. 이동번호=" + transferNo);
        return lines.stream().map(TransferResponse::from).toList();
    }

    /**
     * 창고이동 전표 등록(원본 창고이동입력 E040501) — 머리 하나에 품목 여러 줄.
     * 줄마다 보내는창고에서 빼고 받는창고에 더한다. 한 줄이라도 재고가 모자라면 전표 전체가 롤백된다.
     */
    @Transactional
    public List<TransferResponse> createSlip(TransferSlipRequest req, String username) {
        LocalDate date = req.transferDate() != null ? req.transferDate() : LocalDate.now();
        List<TransferResponse> out = writeSlip(generateNo(date), date, req, username);
        recordHistory(com.erp.common.history.ChangeHistoryService.CREATED, transferRepository.findSlip(out.get(0).transferNo()));
        return out;
    }

    /**
     * 창고이동 전표 수정(원본 창고이동조회에서 이동번호를 눌러 고친 뒤 [저장(F8)]).
     * 옛 줄이 남긴 수불 줄을 거두고(잔량은 되돌림) 새 줄로 다시 옮긴다 — 원본처럼 수불부에는 고친 수량 한 줄만 남는다.
     * 이동번호 · 줄 행은 그대로 고쳐 써서 최초작성일시가 남는다(수정 창 [H] 이력의 '신규').
     */
    @Transactional
    public List<TransferResponse> updateSlip(String transferNo, TransferSlipRequest req, String username) {
        List<StockTransfer> old = transferRepository.findSlip(transferNo);
        if (old.isEmpty()) throw ApiException.notFound("창고이동을 찾을 수 없습니다. 이동번호=" + transferNo);
        withdraw(old.get(0));
        LocalDate date = req.transferDate() != null ? req.transferDate() : old.get(0).getTransferDate();
        List<TransferResponse> out = writeSlip(transferNo, date, req, username, old);
        recordHistory(com.erp.common.history.ChangeHistoryService.UPDATED, transferRepository.findSlip(transferNo));
        return out;
    }

    /** 창고이동 전표 삭제 — 줄마다 남긴 수불 줄을 거두고(잔량은 되돌림) 전표를 지운다. 원본도 삭제 뒤 수불부에 줄이 안 남는다. */
    @Transactional
    public void deleteSlip(String transferNo, String username) {
        List<StockTransfer> old = transferRepository.findSlip(transferNo);
        if (old.isEmpty()) throw ApiException.notFound("창고이동을 찾을 수 없습니다. 이동번호=" + transferNo);
        withdraw(old.get(0));
        recordHistory(com.erp.common.history.ChangeHistoryService.DELETED, old);
        transferRepository.deleteAll(old);
    }

    /** 전표가 수불에 남기는 적요 — 전표의 줄들이 같은 적요를 나눠 든다(거둘 때 이것으로 찾는다). */
    private static String noteOf(String transferNo, Warehouse from, Warehouse to) {
        return "창고이동 " + transferNo + " (" + from.getName() + "→" + to.getName() + ")";
    }

    /**
     * 전표가 남긴 수불 줄을 거둔다. 줄 행은 그 줄의 재고 거래보다 조금 뒤에 저장되므로(같은 트랜잭션) 처음 쓴 때에서 몇 초 앞부터 본다.
     * 최초작성일시가 없는 옛 행이면 같은 적요 전부다.
     */
    private void withdraw(StockTransfer head) {
        java.time.LocalDateTime since = head.getCreatedAt() != null
                ? head.getCreatedAt().minusSeconds(5) : java.time.LocalDateTime.of(1900, 1, 1, 0, 0);
        stockService.withdraw(noteOf(head.getTransferNo(), head.getFromWarehouse(), head.getToWarehouse()), since);
    }

    private List<TransferResponse> writeSlip(String transferNo, LocalDate date, TransferSlipRequest req, String username) {
        return writeSlip(transferNo, date, req, username, List.of());
    }

    /** 줄을 쓴다. reuse 가 있으면(수정) 그 행을 차례로 고쳐 쓰고, 남는 옛 행은 지운다. */
    private List<TransferResponse> writeSlip(String transferNo, LocalDate date, TransferSlipRequest req, String username,
                                             List<StockTransfer> reuse) {
        if (req.fromWarehouseId().equals(req.toWarehouseId())) {
            throw ApiException.badRequest("보내는창고와 받는창고가 같을 수 없습니다.");
        }
        Warehouse from = warehouseRepository.findById(req.fromWarehouseId())
                .orElseThrow(() -> ApiException.notFound("보내는창고를 찾을 수 없습니다. id=" + req.fromWarehouseId()));
        Warehouse to = warehouseRepository.findById(req.toWarehouseId())
                .orElseThrow(() -> ApiException.notFound("받는창고를 찾을 수 없습니다. id=" + req.toWarehouseId()));
        var project = req.projectId() == null ? null : projectService.get(req.projectId());
        String note = noteOf(transferNo, from, to);

        List<StockTransfer> saved = new ArrayList<>();
        int lineNo = 0;
        for (TransferLineRequest line : req.lines()) {
            Item item = itemRepository.findById(line.itemId())
                    .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + line.itemId()));
            stockService.applyDelta(item, from, line.quantity().negate(), StockTransactionType.OUTBOUND, null, date, note, username);
            stockService.applyDelta(item, to, line.quantity(), StockTransactionType.INBOUND, null, date, note, username);
            if (lineNo < reuse.size()) {
                StockTransfer t = reuse.get(lineNo++);
                t.setTransferDate(date);
                t.setItem(item);
                t.setFromWarehouse(from);
                t.setToWarehouse(to);
                t.setQuantity(line.quantity());
                t.setProject(project);
                t.setEmployeeId(req.employeeId());
                t.setReason(line.reason());
                saved.add(t);
                continue;
            }
            saved.add(transferRepository.save(StockTransfer.builder()
                    .transferNo(transferNo)
                    .lineNo(++lineNo)
                    .transferDate(date)
                    .item(item)
                    .fromWarehouse(from)
                    .toWarehouse(to)
                    .quantity(line.quantity())
                    .project(project)
                    .employeeId(req.employeeId())
                    .reason(line.reason())
                    .createdBy(username)
                    .build()));
        }
        if (reuse.size() > lineNo) transferRepository.deleteAll(reuse.subList(lineNo, reuse.size()));
        transferRepository.flush();
        return saved.stream().map(TransferResponse::from).toList();
    }

    private String generateNo(LocalDate date) {
        return docNoGenerator.next("TR-", "stock_transfers", "transfer_no", "transfer_date", date);
    }
}
