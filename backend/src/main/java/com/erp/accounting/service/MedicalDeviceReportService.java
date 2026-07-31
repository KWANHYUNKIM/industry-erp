package com.erp.accounting.service;

import com.erp.accounting.domain.MedicalDeviceReport;
import com.erp.accounting.dto.MedicalDeviceDtos.ReportResponse;
import com.erp.accounting.dto.MedicalDeviceDtos.SupplyLine;
import com.erp.accounting.repository.MedicalDeviceReportRepository;
import com.erp.common.ApiException;
import com.erp.common.FileStorageService;
import com.erp.common.StoredFile;
import com.erp.inventory.dto.ItemDtos.ItemResponse;
import com.erp.inventory.dto.StockAdjustmentDtos.AdjustmentResponse;
import com.erp.inventory.domain.enums.StockAdjustmentType;
import com.erp.inventory.service.ItemService;
import com.erp.inventory.service.StockAdjustmentService;
import com.erp.trade.dto.PartnerDtos.PartnerResponse;
import com.erp.trade.dto.SalesDtos.SalesResponse;
import com.erp.trade.service.PartnerService;
import com.erp.trade.service.SalesService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 의료기기공급내역보고(E040231).
 *
 * <p>대상 품목은 <b>UDI-DI 가 등록된 품목</b>이다. 공급내역은 우리 전표에서 실제로 뽑을 수 있는 두 가지만 낸다 —
 * <b>출고</b>(판매 라인)와 <b>폐기</b>(재고조정 폐기). 원본의 반품·임대·회수는 해당하는 전표 종류가 우리에게 없어
 * 만들지 않는다(값이 없는 구분을 콤보에만 넣으면 늘 0건인 가짜 조건이 된다).
 *
 * <p><b>전송은 하지 않는다.</b> 심평원 제출 채널·인증서가 없으므로 그 달의 공급내역을 확정해 보고파일(CSV)로
 * 산출·보관하고 이력을 남기는 데까지가 이 서비스의 범위다. 채널이 붙으면 산출 결과를 그대로 실어 보내면 된다.
 *
 * <p>다른 모듈의 데이터는 전부 그 모듈의 service 를 거친다(CLAUDE.md §4.2).
 */
@Service
@RequiredArgsConstructor
public class MedicalDeviceReportService {

    private static final String OUT = "OUT";
    private static final String DISPOSAL = "DISPOSAL";

    private final MedicalDeviceReportRepository reportRepository;
    private final FileStorageService fileStorage;
    private final ItemService itemService;
    private final SalesService salesService;
    private final StockAdjustmentService stockAdjustmentService;
    private final PartnerService partnerService;

    /**
     * 기간의 공급내역 산출.
     *
     * @param supplyType null 이면 전체, 아니면 OUT/DISPOSAL
     * @param partnerId  null 이면 전체 (폐기는 거래처가 없어 partnerId 지정 시 빠진다)
     */
    @Transactional(readOnly = true)
    public List<SupplyLine> lines(LocalDate from, LocalDate to, String supplyType, Long partnerId) {
        Map<Long, String> udiByItem = itemService.findAll().stream()
                .filter(i -> StringUtils.hasText(i.udiDi()))
                .collect(Collectors.toMap(ItemResponse::id, ItemResponse::udiDi));
        if (udiByItem.isEmpty()) {
            return List.of();
        }
        Map<Long, PartnerResponse> partners = partnerService.findAll().stream()
                .collect(Collectors.toMap(PartnerResponse::id, Function.identity()));

        List<SupplyLine> rows = new ArrayList<>();

        // 출고 — 판매 전표의 UDI 품목 라인
        if (supplyType == null || OUT.equals(supplyType)) {
            for (SalesResponse s : salesService.findAll()) {
                if (s.saleDate().isBefore(from) || s.saleDate().isAfter(to)) continue;
                if (partnerId != null && !partnerId.equals(s.partnerId())) continue;
                PartnerResponse p = partners.get(s.partnerId());
                s.lines().stream()
                        .filter(l -> udiByItem.containsKey(l.itemId()))
                        .forEach(l -> rows.add(new SupplyLine(
                                s.saleDate(), OUT, "출고", s.docNo(),
                                udiByItem.get(l.itemId()),
                                l.itemId(), l.itemCode(), l.itemName(), l.unit(),
                                l.quantity(),
                                s.partnerId(), s.partnerName(), p != null ? p.bizRegNo() : null)));
            }
        }

        // 폐기 — 재고조정(폐기)의 UDI 품목. 거래처 개념이 없어 거래처 조건을 주면 대상이 아니다.
        if ((supplyType == null || DISPOSAL.equals(supplyType)) && partnerId == null) {
            for (AdjustmentResponse a : stockAdjustmentService.findAll()) {
                if (a.type() != StockAdjustmentType.DISPOSAL) continue;
                if (a.adjustDate().isBefore(from) || a.adjustDate().isAfter(to)) continue;
                if (!udiByItem.containsKey(a.itemId())) continue;
                rows.add(new SupplyLine(
                        a.adjustDate(), DISPOSAL, "폐기", a.adjustNo(),
                        udiByItem.get(a.itemId()),
                        a.itemId(), a.itemCode(), a.itemName(), a.unit(),
                        a.quantityChange().abs(),
                        null, null, null));
            }
        }

        rows.sort(Comparator.comparing(SupplyLine::supplyDate).thenComparing(SupplyLine::docNo,
                Comparator.nullsLast(Comparator.naturalOrder())));
        return rows;
    }

    /** 송신이력(보고파일 산출 이력) */
    @Transactional(readOnly = true)
    public List<ReportResponse> history() {
        return reportRepository.findAllByOrderByReportMonthDescIdDesc().stream()
                .map(ReportResponse::from).toList();
    }

    /**
     * 보고기준월의 공급내역을 확정해 보고파일(CSV)로 만든다.
     * 같은 달을 다시 만들면 이력이 한 줄 더 쌓인다(재산출) — 앞의 파일을 덮어쓰지 않는다.
     */
    @Transactional
    public ReportResponse generate(String reportMonth, String username) {
        YearMonth ym;
        try {
            ym = YearMonth.parse(reportMonth);
        } catch (RuntimeException e) {
            throw ApiException.badRequest("보고기준월 형식이 올바르지 않습니다(yyyy-MM): " + reportMonth);
        }
        LocalDate from = ym.atDay(1);
        LocalDate to = ym.atEndOfMonth();
        List<SupplyLine> rows = lines(from, to, null, null);
        if (rows.isEmpty()) {
            throw ApiException.badRequest(reportMonth + " 에 보고할 의료기기 공급내역이 없습니다. "
                    + "(품목에 UDI-DI 가 등록돼 있고 그 달에 판매·폐기가 있어야 합니다.)");
        }

        StoredFile file = fileStorage.storeText(
                "의료기기공급내역_" + reportMonth + ".csv", "text/csv", toCsv(rows), username);

        BigDecimal totalQty = rows.stream().map(SupplyLine::quantity)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return ReportResponse.from(reportRepository.save(MedicalDeviceReport.builder()
                .reportMonth(reportMonth)
                .periodFrom(from)
                .periodTo(to)
                .lineCount(rows.size())
                .totalQty(totalQty)
                .file(file)
                .createdBy(username)
                .build()));
    }

    @Transactional
    public void delete(Long id) {
        MedicalDeviceReport r = reportRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("보고 이력을 찾을 수 없습니다. id=" + id));
        Long fileId = r.getFile() != null ? r.getFile().getId() : null;
        reportRepository.delete(r);
        if (fileId != null) {
            fileStorage.delete(fileId);
        }
    }

    /**
     * 보고파일 본문. 심평원 제출 규격이 확정되기 전이라 <b>우리 산출 항목</b>으로 만든다 —
     * 규격이 정해지면 이 메서드만 바꾸면 된다. 엑셀에서 열 때 한글이 깨지지 않도록 BOM 을 붙인다.
     */
    private String toCsv(List<SupplyLine> rows) {
        StringBuilder sb = new StringBuilder("﻿");
        sb.append("공급일자,공급구분,전표번호,UDI-DI,품목코드,품목명,수량,단위,공급받는자,사업자등록번호\n");
        for (SupplyLine r : rows) {
            sb.append(r.supplyDate()).append(',')
                    .append(r.supplyTypeName()).append(',')
                    .append(csv(r.docNo())).append(',')
                    .append(csv(r.udiDi())).append(',')
                    .append(csv(r.itemCode())).append(',')
                    .append(csv(r.itemName())).append(',')
                    .append(r.quantity().toPlainString()).append(',')
                    .append(csv(r.unit())).append(',')
                    .append(csv(r.partnerName())).append(',')
                    .append(csv(r.partnerBizRegNo())).append('\n');
        }
        return sb.toString();
    }

    private String csv(String v) {
        if (v == null) return "";
        return v.contains(",") || v.contains("\"") ? '"' + v.replace("\"", "\"\"") + '"' : v;
    }
}
