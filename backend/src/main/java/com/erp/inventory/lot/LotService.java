package com.erp.inventory.lot;

import com.erp.common.ApiException;
import com.erp.inventory.item.Item;
import com.erp.inventory.warehouse.Warehouse;
import com.erp.inventory.lot.dto.LotDtos.AdjustLotRequest;
import com.erp.inventory.lot.dto.LotDtos.ConsumeLotRequest;
import com.erp.inventory.lot.dto.LotDtos.CreateLotRequest;
import com.erp.inventory.lot.dto.LotDtos.HoldLotRequest;
import com.erp.inventory.lot.dto.LotDtos.LotResponse;
import com.erp.inventory.lot.dto.LotDtos.LotTransactionResponse;
import com.erp.inventory.item.ItemRepository;
import com.erp.inventory.warehouse.WarehouseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.List;
import com.erp.inventory.lot.dto.LotDtos;

@Service
@RequiredArgsConstructor
public class LotService {

    private final LotRepository lotRepository;
    private final ItemRepository itemRepository;
    private final WarehouseRepository warehouseRepository;
    private final LotTransactionRepository lotTxRepository;

    @Transactional(readOnly = true)
    public List<LotTransactionResponse> transactions() {
        return transactions(null, null);
    }

    /**
     * 화면 조건 판의 <b>[기준일자]</b>. 서버가 이 구간만 준다 — 전에는 여태 쌓인 움직임을
     * 통째로 주었다(원본 E040620 은 [전월+금월] 을 보고 열린다).
     */
    @Transactional(readOnly = true)
    public List<LotTransactionResponse> transactions(java.time.LocalDate from, java.time.LocalDate to) {
        return lotTxRepository.findByPeriodWithRefs(
                        from != null ? from : java.time.LocalDate.of(1900, 1, 1),
                        to != null ? to : java.time.LocalDate.of(9999, 12, 31)).stream()
                .map(LotTransactionResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<LotResponse> findAll() {
        return findAll(null);
    }

    /**
     * 로트 목록. <code>asOf</code> 를 주면 <b>그 날 시점의 잔량</b>으로 되돌린다
     * (원본 품목vs시리얼재고수량비교의 [기준일자]).
     *
     * <p>품목 재고를 asOf 로 되돌리는 방식과 같다 — <b>지금 잔량에서 그 뒤의 움직임을 뺀다.</b>
     * 품목 쪽만 되돌리고 로트는 오늘 것을 쓰면, 있지도 않은 차이가 표에 가득 찬다.
     */
    @Transactional(readOnly = true)
    public List<LotResponse> findAll(java.time.LocalDate asOf) {
        List<Lot> lots = lotRepository.findAllWithRefs();
        if (asOf == null) return lots.stream().map(LotResponse::from).toList();
        Map<Long, BigDecimal> after = new HashMap<>();
        for (Object[] r : lotTxRepository.sumChangeAfter(asOf)) {
            after.put((Long) r[0], (BigDecimal) r[1]);
        }
        return lots.stream()
                .map((l) -> LotResponse.from(l).withStockQty(
                        l.getStockQty().subtract(after.getOrDefault(l.getId(), BigDecimal.ZERO))))
                .toList();
    }

    @Transactional
    public LotResponse create(CreateLotRequest req) {
        if (lotRepository.existsByLotNo(req.lotNo())) {
            throw ApiException.conflict("이미 존재하는 로트No.입니다: " + req.lotNo());
        }
        Item item = itemRepository.findById(req.itemId())
                .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + req.itemId()));
        Warehouse warehouse = req.warehouseId() != null
                ? warehouseRepository.findById(req.warehouseId())
                    .orElseThrow(() -> ApiException.notFound("창고를 찾을 수 없습니다. id=" + req.warehouseId()))
                : null;

        Lot lot = Lot.builder()
                .lotNo(req.lotNo())
                .item(item)
                .warehouse(warehouse)
                .inboundDate(req.inboundDate() != null ? req.inboundDate() : LocalDate.now())
                .expireDate(req.expireDate())
                .inboundQty(req.inboundQty())
                .stockQty(req.inboundQty())
                .held(false)
                .build();
        Lot saved = lotRepository.save(lot);
        /*
         * 입고 이력은 <b>입고일자</b>에 단다. 여태 등록한 날(오늘)로 달아, 입고일을 지난 날로 적은 로트가
         * 기준일자를 그 사이로 잡은 재고현황·품목vs시리얼비교에서 0 으로 되돌려지고(오늘 들어온 것으로 빼서)
         * 수불부·내역현황에도 입고일이 아니라 등록일에 찍혔다.
         */
        recordTx(saved, LotTxType.INBOUND, req.inboundQty(), saved.getStockQty(), "로트 입고 " + saved.getLotNo(),
                saved.getInboundDate());
        return LotResponse.from(saved);
    }

    @Transactional
    public LotResponse consume(Long id, ConsumeLotRequest req) {
        Lot lot = getLot(id);
        if (lot.isHeld()) {
            throw ApiException.badRequest("보류 상태의 로트는 출고할 수 없습니다.");
        }
        if (req.qty().compareTo(lot.getStockQty()) > 0) {
            throw ApiException.badRequest(String.format(
                    "로트 재고가 부족합니다. 현재고 %s, 요청 %s",
                    lot.getStockQty().stripTrailingZeros().toPlainString(), req.qty().stripTrailingZeros().toPlainString()));
        }
        lot.setStockQty(lot.getStockQty().subtract(req.qty()));
        recordTx(lot, LotTxType.OUTBOUND, req.qty().negate(), lot.getStockQty(), "로트 소모");
        return LotResponse.from(lot);
    }

    /** 로트 실사 조정 — 실사수량으로 재고를 맞추고 차이를 조정 이력으로 남긴다. */
    @Transactional
    public LotResponse adjust(Long id, AdjustLotRequest req) {
        Lot lot = getLot(id);
        BigDecimal target = req.actualQty();
        if (target.signum() < 0) {
            throw ApiException.badRequest("실사수량은 0 이상이어야 합니다.");
        }
        BigDecimal delta = target.subtract(lot.getStockQty());
        if (delta.signum() == 0) {
            throw ApiException.badRequest("실사수량이 현재고와 같습니다. 조정할 차이가 없습니다.");
        }
        lot.setStockQty(target);
        String note = "로트 실사조정" + (req.note() != null && !req.note().isBlank() ? " (" + req.note() + ")" : "");
        /*
         * 원본 시리얼/로트No.재고조정(E040634)이 남기는 줄은 [전표구분] '재고조정' · [연결전표-No.] 없음이다
         * (2026-10-04 실측: QA재고2-LOT1 을 0 → 5 로 맞추면 내역조회에 2026/10/04 -1 · 재고조정 한 줄).
         */
        lotTxRepository.save(LotTransaction.builder()
                .lot(lot).txDate(LocalDate.now()).type(LotTxType.ADJUST)
                .quantityChange(delta).balanceAfter(target).note(note).docType("재고조정")
                .build());
        return LotResponse.from(lot);
    }

    @Transactional
    public LotResponse hold(Long id, HoldLotRequest req) {
        Lot lot = getLot(id);
        lot.setHeld(req.held());
        return LotResponse.from(lot);
    }

    /** 로트No. 로 등록된 로트를 찾는다(품질검사가 자유입력 로트No. 를 등록된 로트와 잇는다). */
    @Transactional(readOnly = true)
    public java.util.Optional<Lot> findByLotNo(String lotNo) {
        return lotRepository.findByLotNo(lotNo);
    }

    /** 전표 한 줄의 시리얼/로트 — 수량은 부호를 든다(들어오면 +, 나가면 −). */
    public record DocLine(Item item, Warehouse warehouse, String lotNo, BigDecimal quantity) {}

    /**
     * 구매 · 판매 같은 전표가 시리얼/로트를 움직인다 — 원본 시리얼/로트No.내역조회(E040618)는 그 줄을
     * [전표구분] '구매' · [연결전표-No.] 로 보인다(2026-10-03 실측). 예전엔 전표 줄의 로트No. 를 적어 두기만 하고
     * 로트 재고 · 내역에는 아무 것도 남기지 않아, 로트 화면은 로트등록에서 손으로 넣은 것만 보였다.
     *
     * <p>같은 전표가 남긴 줄을 먼저 되돌리고 새로 적는다(수정 = 되돌리고 다시). 없는 로트No. 면 그 품목의
     * 로트를 새로 만든다. 로트 재고는 막지 않는다 — 원본도 품목 재고와 시리얼 재고가 어긋날 수 있어
     * [품목vs시리얼재고수량비교] 를 따로 둔다.
     */
    @Transactional
    public void replaceDocument(String docType, Long sourceId, String sourceNo, LocalDate date,
                                String partnerName, List<DocLine> lines) {
        removeDocument(docType, sourceId);
        for (DocLine dl : lines) {
            if (dl.lotNo() == null || dl.lotNo().isBlank() || dl.quantity().signum() == 0) continue;
            String no = dl.lotNo().trim();
            Lot lot = lotRepository.findByLotNo(no).orElse(null);
            if (lot == null) {
                BigDecimal in = dl.quantity().max(BigDecimal.ZERO);
                lot = lotRepository.save(Lot.builder()
                        .lotNo(no).item(dl.item()).warehouse(dl.warehouse())
                        .inboundDate(date).inboundQty(in).stockQty(BigDecimal.ZERO)
                        .held(false).build());
            } else if (!lot.getItem().getId().equals(dl.item().getId())) {
                throw ApiException.badRequest("시리얼/로트No. " + no + " 은(는) 다른 품목("
                        + lot.getItem().getName() + ")에 쓰였습니다.");
            }
            lot.setStockQty(lot.getStockQty().add(dl.quantity()));
            lotTxRepository.save(LotTransaction.builder()
                    .lot(lot).txDate(date)
                    .type(dl.quantity().signum() > 0 ? LotTxType.INBOUND : LotTxType.OUTBOUND)
                    .quantityChange(dl.quantity()).balanceAfter(lot.getStockQty())
                    .note(docType + " " + sourceNo)
                    .docType(docType).sourceId(sourceId).sourceNo(sourceNo).partnerName(partnerName)
                    .build());
        }
    }

    /** 전표를 지우면 그 전표가 남긴 시리얼/로트 줄도 되돌려 지운다. 전표로만 생긴 로트는 줄이 다 빠지면 같이 지운다. */
    @Transactional
    public void removeDocument(String docType, Long sourceId) {
        if (sourceId == null) return;
        List<LotTransaction> txs = lotTxRepository.findByDocTypeAndSourceIdOrderByIdDesc(docType, sourceId);
        if (txs.isEmpty()) return;
        java.util.Set<Lot> touched = new java.util.LinkedHashSet<>();
        for (LotTransaction t : txs) {
            Lot lot = t.getLot();
            lot.setStockQty(lot.getStockQty().subtract(t.getQuantityChange()));
            touched.add(lot);
        }
        lotTxRepository.deleteAll(txs);
        lotTxRepository.flush();
        for (Lot lot : touched) {
            if (lotTxRepository.countByLot(lot) == 0) lotRepository.delete(lot);
        }
        lotRepository.flush();
    }

    private void recordTx(Lot lot, LotTxType type, BigDecimal change, BigDecimal balanceAfter, String note) {
        recordTx(lot, type, change, balanceAfter, note, LocalDate.now());
    }

    private void recordTx(Lot lot, LotTxType type, BigDecimal change, BigDecimal balanceAfter, String note,
                          LocalDate date) {
        lotTxRepository.save(LotTransaction.builder()
                .lot(lot)
                .txDate(date)
                .type(type)
                .quantityChange(change)
                .balanceAfter(balanceAfter)
                .note(note)
                .build());
    }

    private Lot getLot(Long id) {
        return lotRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("로트를 찾을 수 없습니다. id=" + id));
    }
}
