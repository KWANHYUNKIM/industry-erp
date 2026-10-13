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
    private final com.erp.inventory.project.ProjectService projectService;

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

        BigDecimal qty = req.inboundQty() != null ? req.inboundQty() : BigDecimal.ZERO;
        Lot lot = Lot.builder()
                .lotNo(req.lotNo().trim())
                .item(item)
                .warehouse(warehouse)
                .inboundDate(req.inboundDate() != null ? req.inboundDate() : LocalDate.now())
                .expireDate(req.expireDate())
                .inboundQty(qty)
                .stockQty(qty)
                .held(false)
                .udiCode(blank(req.udiCode()))
                .build();
        Lot saved = lotRepository.save(lot);
        /* 원본 등록은 마스터만 만든다(내역 0줄) — 수량을 준 때만(예전 호출) 입고 줄을 남긴다. */
        if (qty.signum() == 0) return LotResponse.from(saved);
        /*
         * 입고 이력은 <b>입고일자</b>에 단다. 여태 등록한 날(오늘)로 달아, 입고일을 지난 날로 적은 로트가
         * 기준일자를 그 사이로 잡은 재고현황·품목vs시리얼비교에서 0 으로 되돌려지고(오늘 들어온 것으로 빼서)
         * 수불부·내역현황에도 입고일이 아니라 등록일에 찍혔다.
         */
        recordTx(saved, LotTxType.INBOUND, req.inboundQty(), saved.getStockQty(), "로트 입고 " + saved.getLotNo(),
                saved.getInboundDate());
        return LotResponse.from(saved);
    }

    /** 원본 수정 창 — 번호는 잠기고 품목 · udi코드 · 유효기한만. 내역이 있으면 품목은 못 바꾼다(그 내역의 품목과 어긋난다). */
    @Transactional
    public LotResponse update(Long id, LotDtos.UpdateLotRequest req) {
        Lot lot = getLot(id);
        if (!lot.getItem().getId().equals(req.itemId())) {
            if (lotTxRepository.countByLot(lot) > 0) {
                throw ApiException.badRequest("내역이 있는 시리얼/로트No. 는 품목을 바꿀 수 없습니다.");
            }
            lot.setItem(itemRepository.findById(req.itemId())
                    .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + req.itemId())));
        }
        lot.setExpireDate(req.expireDate());
        lot.setUdiCode(blank(req.udiCode()));
        return LotResponse.from(lot);
    }

    /**
     * 원본 수정 창 [삭제] — 내역(전표 · 내역입력 · 재고조정)이 있으면 막는다. 원본 문구(2026-10-13 실측):
     * '처리가 불가능한 코드입니다. 다음 사항을 확인 바랍니다.' + 표 [코드 | 코드명 | 자료] = 'QA재고2-L01 | | 구매: 20261013-0'.
     */
    @Transactional
    public void delete(Long id) {
        Lot lot = getLot(id);
        List<LotTransaction> txs = lotTxRepository.findByLotOrderByTxDateAscIdAsc(lot);
        if (!txs.isEmpty()) {
            LotTransaction t = txs.get(0);
            String kind = t.getDocType() != null ? t.getDocType() : t.getType().getDisplayName();
            throw ApiException.badRequest("처리가 불가능한 코드입니다. 다음 사항을 확인 바랍니다. ["
                    + lot.getLotNo() + "] " + kind + ": " + t.getTxDate().toString().replace("-", "")
                    + (t.getSourceNo() != null ? " " + t.getSourceNo() : ""));
        }
        lotRepository.delete(lot);
    }

    /** 원본 목록 [사용중단/재사용] — 확인 창 · 안내 없이 바로 바뀐다. */
    @Transactional
    public void setUse(List<Long> ids, boolean use) {
        for (Long id : ids) getLot(id).setUseYn(use);
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
        /*
         * 음수도 받는다 — 원본 시리얼/로트No.재고조정(E040634)은 [합계]에 -1 을 넣어 저장해도 '저장되었습니다.' 이고
         * 그 로트 잔량이 -1.00 이 된다(2026-10-13 ryu_0025 0 → -1 → 0 실측). 원본 로트 재고는 원래 음수가 흔하다
         * (재고현황에 -1.00 · -5.00 줄이 그대로 찍힌다).
         */
        BigDecimal target = req.actualQty();
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

    /**
     * 원본 '시리얼/로트No.내역입력' [전표구분] 의 차례와 로트 재고 방향(2026-10-12 실측: 구매 3 → 로트 재고 +3, 판매 3 → −3,
     * 견적 3 → 그대로. 지우면 되돌아간다). 나머지는 재지 못해 품목 재고에서 그 전표가 하는 쪽을 따른다 —
     * 들어오는 것(생산입고) +, 나가는 것(출하 · 생산소모 · 생산불출 · 자가사용 · 불량-폐기 · 불량-품목대체(불량품목)) −,
     * 재고가 움직이지 않는 것(견적 · 주문 · 출하지시 · 발주 · A/S · 창고이동 · 정상사용 · 품질검사 · Invoice) 0.
     */
    public static final Map<String, Integer> MANUAL_DOC_SIGN = new java.util.LinkedHashMap<>();
    static {
        String[][] t = {
            {"견적", "0"}, {"주문", "0"}, {"판매", "-1"}, {"출하지시", "0"}, {"출하", "-1"}, {"발주", "0"}, {"구매", "1"},
            {"생산입고", "1"}, {"생산소모", "-1"}, {"A/S접수", "0"}, {"A/S수리", "0"}, {"창고이동", "0"}, {"생산불출", "-1"},
            {"자가사용", "-1"}, {"불량-품목대체(불량품목)", "-1"}, {"불량-품목대체(정상품목)", "1"}, {"불량-정상사용", "0"},
            {"불량-폐기", "-1"}, {"품질검사요청", "0"}, {"품질검사", "0"}, {"Invoice/Packing List", "0"},
        };
        for (String[] r : t) MANUAL_DOC_SIGN.put(r[0], Integer.parseInt(r[1]));
    }

    /** 원본 [신규(F2)] 내역입력 저장 — 등록된 로트여야 하고 그 품목의 로트여야 한다. 로트 재고를 전표구분 방향으로 움직인다. */
    @Transactional
    public LotTransactionResponse createManual(LotDtos.ManualTxRequest req) {
        Integer sign = MANUAL_DOC_SIGN.get(req.docType());
        if (sign == null) throw ApiException.badRequest("전표구분을 선택하세요.");
        Lot lot = lotRepository.findByLotNo(req.lotNo().trim())
                .orElseThrow(() -> ApiException.badRequest("등록되지 않은 시리얼/로트No. 입니다: " + req.lotNo()));
        if (!lot.getItem().getId().equals(req.itemId())) {
            throw ApiException.badRequest("시리얼/로트No. " + lot.getLotNo() + " 은(는) 다른 품목("
                    + lot.getItem().getName() + ")의 것입니다.");
        }
        Warehouse wh = warehouseRepository.findById(req.warehouseId())
                .orElseThrow(() -> ApiException.badRequest("창고를 찾을 수 없습니다."));
        BigDecimal change = req.quantity().multiply(BigDecimal.valueOf(sign));
        lot.setStockQty(lot.getStockQty().add(change));
        LotTransaction t = lotTxRepository.save(LotTransaction.builder()
                .lot(lot).txDate(req.txDate() != null ? req.txDate() : LocalDate.now())
                .type(sign > 0 ? LotTxType.INBOUND : sign < 0 ? LotTxType.OUTBOUND : LotTxType.ADJUST)
                /* 재고가 움직이지 않는 전표구분(견적 …)도 줄의 수량은 남긴다 — 원본 목록이 3.00 을 찍는다. */
                .quantityChange(sign == 0 ? req.quantity() : change).balanceAfter(lot.getStockQty())
                .note(blank(req.note())).docType(req.docType()).manual(true)
                .warehouse(wh)
                .project(req.projectId() == null ? null : projectService.get(req.projectId()))
                .partnerName(blank(req.partnerName())).chargeName(blank(req.chargeName())).mgmtName(blank(req.mgmtName()))
                .build());
        return LotTransactionResponse.from(t);
    }

    /** 내역입력 고치기 — 원본 수정 창은 [일자] · [전표구분] 을 잠근다. 예전 수량을 되돌리고 새로 적는다. */
    @Transactional
    public LotTransactionResponse updateManual(Long id, LotDtos.ManualTxRequest req) {
        LotTransaction old = lotTxRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("시리얼/로트No.내역을 찾을 수 없습니다. id=" + id));
        if (!old.isManual()) throw ApiException.badRequest("전표에서 생긴 내역은 그 전표에서 고칩니다.");
        LocalDate date = old.getTxDate();
        String docType = old.getDocType();
        deleteManual(List.of(id));
        lotTxRepository.flush();
        return createManual(new LotDtos.ManualTxRequest(date, docType, req.warehouseId(), req.itemId(), req.quantity(),
                req.lotNo(), req.partnerName(), req.mgmtName(), req.chargeName(), req.projectId(), req.note()));
    }

    /** 원본 목록 [선택삭제] — 손으로 넣은 줄만. 지우면 로트 재고가 되돌아간다. */
    @Transactional
    public void deleteManual(List<Long> ids) {
        for (Long id : ids) {
            LotTransaction t = lotTxRepository.findById(id)
                    .orElseThrow(() -> ApiException.notFound("시리얼/로트No.내역을 찾을 수 없습니다. id=" + id));
            if (!t.isManual()) {
                throw ApiException.badRequest("[" + (t.getDocType() != null ? t.getDocType() : t.getType().getDisplayName())
                        + "] 에서 생긴 내역은 그 전표(화면)에서 지웁니다.");
            }
            Integer sign = MANUAL_DOC_SIGN.getOrDefault(t.getDocType(), 0);
            if (sign != 0) t.getLot().setStockQty(t.getLot().getStockQty().subtract(t.getQuantityChange()));
            lotTxRepository.delete(t);
        }
    }

    private static String blank(String v) {
        return v == null || v.isBlank() ? null : v.trim();
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
