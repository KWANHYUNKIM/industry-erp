package com.erp.production.production;

/**
 * 생산입고를 넣은 입력 화면. 원본 이카운트의 생산입고 I·II·III 이다.
 *
 * <ul>
 *   <li><b>I</b> — BOM기준소모. 생산품목과 수량만 넣으면 BOM 소요량만큼 생산된공장에서 자재가 빠진다.</li>
 *   <li><b>II</b> — 소모품목 선택. [소모] 탭에 넣은 자재만 빠진다(비워 두면 소모 없음).</li>
 *   <li><b>III</b> — 공정별. 줄마다 공정·생산된공장·받는창고가 다르고, 소모도 줄마다 고른다.</li>
 * </ul>
 */
public enum ProductionEntryType {
    I, II, III
}
