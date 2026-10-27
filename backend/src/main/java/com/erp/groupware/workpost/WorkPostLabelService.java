package com.erp.groupware.workpost;

import com.erp.common.ApiException;
import com.erp.groupware.board.PostBoard;
import com.erp.groupware.workpost.dto.WorkPostDtos.LabelResponse;
import com.erp.groupware.workpost.dto.WorkPostDtos.SaveLabelRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 원본 '라벨조회' · '라벨등록' · '라벨수정'(2026-10-12 loginaa E200080 실측).
 * <ul>
 *   <li>라벨코드 · 라벨명은 필수(원본은 비우면 칸만 빨갛게 — 우리는 문구로).</li>
 *   <li>라벨수정에서 코드는 막힌다. 색은 팔레트에서 고르고 기본은 검정.</li>
 *   <li>[사용중단/재사용 ▲] 사용중단 · 삭제 · 재사용. 삭제는 묻지 않고 지운다 — 그 라벨이 붙은 글에서도 떨어진다.</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class WorkPostLabelService {

    private static final Pattern COLOR = Pattern.compile("^#[0-9a-fA-F]{6}$");

    private final WorkPostLabelRepository labelRepository;
    private final WorkPostRepository postRepository;

    @Transactional(readOnly = true)
    public List<LabelResponse> list(PostBoard board) {
        return labelRepository.findByBoardOrderByCodeAsc(board).stream().map(LabelResponse::from).toList();
    }

    @Transactional
    public LabelResponse create(SaveLabelRequest req) {
        PostBoard board = req.board() != null ? req.board() : PostBoard.WORK;
        String code = req.code() == null ? "" : req.code().trim();
        if (code.isEmpty()) throw ApiException.badRequest("라벨코드를 입력하세요.");
        if (labelRepository.existsByBoardAndCode(board, code)) throw ApiException.badRequest("이미 있는 라벨코드입니다.");
        return LabelResponse.from(labelRepository.save(WorkPostLabel.builder()
                .board(board).code(code).name(name(req)).color(color(req)).active(true).build()));
    }

    /** 라벨수정 — 코드는 그대로. 이름을 바꾸면 그 이름이 붙은 글도 새 이름으로 바뀐다. */
    @Transactional
    public LabelResponse update(Long id, SaveLabelRequest req) {
        WorkPostLabel label = get(id);
        String before = label.getName();
        label.setName(name(req));
        label.setColor(color(req));
        if (!before.equals(label.getName())) rename(label.getBoard(), before, label.getName());
        return LabelResponse.from(label);
    }

    @Transactional
    public LabelResponse setActive(Long id, boolean active) {
        WorkPostLabel label = get(id);
        label.setActive(active);
        return LabelResponse.from(label);
    }

    @Transactional
    public void delete(Long id) {
        WorkPostLabel label = get(id);
        rename(label.getBoard(), label.getName(), null);
        labelRepository.delete(label);
    }

    /** 그 게시판 글의 라벨 이름 하나를 바꾸거나(to) 뗀다(null). */
    private void rename(PostBoard board, String from, String to) {
        for (WorkPost p : postRepository.findByBoardOrdered(board)) {
            if (p.getLabels() == null) continue;
            List<String> names = Arrays.stream(p.getLabels().split(",")).map(String::trim)
                    .map(x -> x.equals(from) ? to : x).filter(x -> x != null && !x.isEmpty()).distinct().toList();
            p.setLabels(names.isEmpty() ? null : String.join(",", names));
        }
    }

    private static String name(SaveLabelRequest req) {
        String n = req.name() == null ? "" : req.name().trim().replace(",", " ");
        if (n.isEmpty()) throw ApiException.badRequest("라벨명을 입력하세요.");
        return n;
    }

    private static String color(SaveLabelRequest req) {
        if (req.color() == null || req.color().isBlank()) return "#000000";
        if (!COLOR.matcher(req.color()).matches()) throw ApiException.badRequest("색상을 다시 고르세요.");
        return req.color().toLowerCase();
    }

    private WorkPostLabel get(Long id) {
        return labelRepository.findById(id).orElseThrow(() -> ApiException.notFound("라벨을 찾을 수 없습니다. id=" + id));
    }
}
