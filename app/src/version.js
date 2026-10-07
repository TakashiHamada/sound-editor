// Build-time version banner values (branch name + JST build timestamp), injected by Vite `define`.
/* global __APP_BRANCH__, __APP_BUILD_TIME__ */

export const BUILD_BRANCH = __APP_BRANCH__;
export const BUILD_TIME = __APP_BUILD_TIME__;
