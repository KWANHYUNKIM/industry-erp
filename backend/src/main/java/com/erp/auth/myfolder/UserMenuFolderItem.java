package com.erp.auth.myfolder;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 폴더에 담은 화면 하나. 원본처럼 <b>메뉴명도 고칠 수 있다</b> — 그래서 이름(label)을 경로와 따로 든다.
 * 같은 폴더에 같은 화면을 두 번 담을 까닭이 없어 (폴더, 경로) 가 유일하다.
 */
@Entity
@Table(name = "user_menu_folder_items",
        uniqueConstraints = @UniqueConstraint(name = "uk_user_menu_folder_items_folder_path",
                columnNames = {"folder_id", "path"}))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class UserMenuFolderItem extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "folder_id", nullable = false)
    private UserMenuFolder folder;

    /** 왼쪽 메뉴에 찍히는 이름. 처음엔 메뉴 이름을 그대로 담고, 사용자가 고칠 수 있다. */
    @Column(nullable = false, length = 100)
    private String label;

    /** 갈 곳(화면 경로). */
    @Column(nullable = false, length = 200)
    private String path;

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private int sortOrder = 0;
}
