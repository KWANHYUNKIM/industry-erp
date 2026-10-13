package com.erp.groupware.printsign;

import com.erp.common.ApiException;
import com.erp.groupware.printsign.dto.PrintSignDtos.LineInput;
import com.erp.groupware.printsign.dto.PrintSignDtos.LineResponse;
import com.erp.groupware.printsign.dto.PrintSignDtos.ModuleResponse;
import com.erp.groupware.printsign.dto.PrintSignDtos.SaveRequest;
import com.erp.groupware.printsign.dto.PrintSignDtos.SlotInput;
import com.erp.groupware.printsign.dto.PrintSignDtos.SlotResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 인쇄용결재라인등록(원본 E010106 · E090102). 모듈(회계 · 재고 · 관리)마다 결재라인 1 · 2 를 한 장으로 저장한다.
 *
 * 아직 저장한 적 없는 모듈 · 줄은 원본이 처음 보여 주는 값(2026-10-13 loginaa 실측)을 돌려준다 — 저장하기 전에는 DB 에 넣지 않는다.
 */
@Service
@RequiredArgsConstructor
public class PrintSignService {

    public static final int SLOT_COUNT = 9;
    /** 명칭은 있는데 가로가 빈 칸에 저장할 때 채우는 값 — 2026-10-13 원본: 앞 칸이 없는 결재라인 2 결재자 1 도 80 으로 채웠다 */
    static final int DEFAULT_WIDTH = 80;

    private static final String[] TITLES = {"담당", "대리", "과장", "차장", "상무", "사장", "회장"};

    /** 원본 처음 값: 회계 · 재고 = 결재라인 26 · 12px, 담당 · 대리 · 과장 70, 차장 ~ 회장 80 · 11px / 관리 = 28 · 담당 · 대리 · 과장 60, 나머지 가로 빈칸 */
    private static final Map<PrintSignModule, Integer[]> DEFAULT_WIDTHS = Map.of(
            PrintSignModule.ACCOUNTING, new Integer[]{26, 70, 70, 70, 80, 80, 80, 80},
            PrintSignModule.INVENTORY, new Integer[]{26, 70, 70, 70, 80, 80, 80, 80},
            PrintSignModule.MANAGEMENT, new Integer[]{28, 60, 60, 60, null, null, null, null});

    private final PrintSignLineRepository repository;

    @Transactional(readOnly = true)
    public ModuleResponse find(PrintSignModule module) {
        List<PrintSignLine> saved = repository.findByModuleWithSlots(module);
        List<LineResponse> lines = new ArrayList<>();
        for (int no = 1; no <= 2; no++) {
            final int n = no;
            lines.add(saved.stream().filter(l -> l.getLineNo() == n).findFirst()
                    .map(this::padded).orElseGet(() -> defaults(module, n)));
        }
        return new ModuleResponse(module.name(), lines);
    }

    /** 출력물이 찍는 결재라인 1. 찍을 칸(명칭 · 가로가 둘 다 있는 결재자)이 없으면 null. */
    @Transactional(readOnly = true)
    public LineResponse findForPrint(PrintSignModule module) {
        LineResponse line = find(module).lines().get(0);
        List<SlotResponse> printable = line.slots().stream()
                .filter(s -> s.title() != null && !s.title().isBlank() && s.widthPx() != null).toList();
        if (printable.isEmpty()) return null;
        return new LineResponse(line.lineNo(), line.labelName(), line.labelWidth(), line.labelFont(), printable);
    }

    @Transactional
    public ModuleResponse save(PrintSignModule module, SaveRequest req) {
        for (LineInput in : req.lines()) {
            PrintSignLine line = repository.findByModuleAndLineNo(module, in.lineNo())
                    .orElseGet(() -> repository.save(PrintSignLine.builder().module(module).lineNo(in.lineNo()).build()));
            line.setLabelName(blankToNull(in.labelName()));
            line.setLabelWidth(in.labelWidth());
            line.setLabelFont(in.labelFont());
            // 칸을 지우고 다시 넣는다. flush 를 끼우지 않으면 Hibernate 가 삭제보다 삽입을 먼저 내보내
            // (sign_line_id, slot_order) 유니크 제약에 걸린다.
            line.clearSlots();
            repository.flush();
            List<SlotInput> slots = in.slots() == null ? List.of() : in.slots();
            for (int i = 0; i < SLOT_COUNT; i++) {
                SlotInput s = i < slots.size() ? slots.get(i) : null;
                String title = s == null ? null : blankToNull(s.title());
                Integer width = s == null ? null : s.widthPx();
                if (title != null && width == null) width = DEFAULT_WIDTH;
                line.addSlot(PrintSignSlot.builder()
                        .title(title).widthPx(width)
                        .fontPx(s == null ? null : s.fontPx())
                        .build());
            }
        }
        return find(module);
    }

    /** 저장된 줄은 결재자 9칸으로 채워 돌려준다(옛 서식은 셋뿐이다) */
    private LineResponse padded(PrintSignLine l) {
        List<SlotResponse> slots = new ArrayList<>(l.getSlots().stream().map(SlotResponse::from).toList());
        int font = l.getLineNo() == 1 ? 11 : 12;
        for (int i = slots.size(); i < SLOT_COUNT; i++) slots.add(new SlotResponse(i + 1, null, null, font));
        return new LineResponse(l.getLineNo(), l.getLabelName(), l.getLabelWidth(), l.getLabelFont(), slots);
    }

    private LineResponse defaults(PrintSignModule module, int lineNo) {
        List<SlotResponse> slots = new ArrayList<>();
        if (lineNo == 2) {
            // 결재라인 2 는 비어 있다 — 글자만 회계 · 재고 결재라인 9px · 결재자 12px, 관리 12px · 11px
            boolean mgmt = module == PrintSignModule.MANAGEMENT;
            for (int i = 0; i < SLOT_COUNT; i++) slots.add(new SlotResponse(i + 1, null, null, mgmt ? 11 : 12));
            return new LineResponse(2, null, null, mgmt ? 12 : 9, slots);
        }
        Integer[] w = DEFAULT_WIDTHS.get(module);
        for (int i = 0; i < SLOT_COUNT; i++) {
            slots.add(new SlotResponse(i + 1, i < TITLES.length ? TITLES[i] : null, i < TITLES.length ? w[i + 1] : null, 11));
        }
        return new LineResponse(1, null, w[0], 12, slots);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    public static PrintSignModule parseModule(String module) {
        if (module == null || module.isBlank()) return PrintSignModule.ACCOUNTING;
        try {
            return PrintSignModule.valueOf(module.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("알 수 없는 모듈입니다: " + module);
        }
    }
}
