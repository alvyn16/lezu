file(MAKE_DIRECTORY "${TEST_ROOT}/data/LEZU/restore-recovery" "${TEST_ROOT}/config")
set(journal "${TEST_ROOT}/data/LEZU/restore-recovery/active.json")
set(sentinel "invalid journal sentinel")
file(WRITE "${journal}" "${sentinel}")
execute_process(
  COMMAND "${CMAKE_COMMAND}" -E env
    "QT_QPA_PLATFORM=offscreen" "QT_QUICK_BACKEND=software"
    "XDG_DATA_HOME=${TEST_ROOT}/data" "XDG_CONFIG_HOME=${TEST_ROOT}/config"
    "${LEZU}" --details-direction-test --render-size=1400x1100
  RESULT_VARIABLE result OUTPUT_VARIABLE output ERROR_VARIABLE errors TIMEOUT 15)
if(NOT "${result}" STREQUAL "0")
  message(FATAL_ERROR "Details fixture entered recovery or failed: ${result}\n${output}\n${errors}")
endif()
file(READ "${journal}" after)
if(NOT after STREQUAL sentinel)
  message(FATAL_ERROR "Details fixture modified personal recovery state")
endif()
