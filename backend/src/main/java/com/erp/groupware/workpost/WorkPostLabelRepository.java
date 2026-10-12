package com.erp.groupware.workpost;

import com.erp.groupware.board.PostBoard;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface WorkPostLabelRepository extends JpaRepository<WorkPostLabel, Long> {

    List<WorkPostLabel> findByBoardOrderByCodeAsc(PostBoard board);

    boolean existsByBoardAndCode(PostBoard board, String code);
}
