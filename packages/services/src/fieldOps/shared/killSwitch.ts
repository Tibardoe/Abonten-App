// Deploy-level emergency stop for the Field Ops programme, mirroring
// REWARDS_KILL_SWITCH. When set to "true" on the web and admin deployments
// the programme reads as switched off regardless of
// fieldops_program_setting: /field is a 404, member/lead writes are refused,
// and the admin module shows the flag. It never touches data.
export function isFieldOpsKillSwitchOn(): boolean {
  return process.env.FIELD_OPS_KILL_SWITCH === "true";
}
