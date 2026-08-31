export type ShiftStyle = "relaxed" | "medium" | "sport";

const SHIFT_RPM: Record<ShiftStyle, number> = {
  relaxed: 0.45, // fraction of the rev range used before "shifting"
  medium: 0.65,
  sport: 0.88,
};

/** Gear top speeds in mph (relative shape; scaled by maxSpeed setting). */
const GEAR_TOPS = [0.14, 0.28, 0.45, 0.64, 0.82, 1.0];

export type DrivetrainState = {
  rpm: number;
  gear: number;
  throttle: number;
};

export class Drivetrain {
  private smoothedSpeed = 0;
  private lastSpeed = 0;
  private accel = 0;
  private revRpm = 0;
  rpm = 0;

  /**
   * @param speedMph current GPS speed
   * @param dt seconds since last tick
   * @param revHeld whether the REV button is held
   * @param opts settings
   */
  tick(
    speedMph: number,
    dt: number,
    revHeld: boolean,
    opts: {
      idleRpm: number;
      redlineRpm: number;
      maxSpeed: number;
      shiftStyle: ShiftStyle;
      /** 0 = smoother, 1 = faster */
      response: number;
      /** extra throttle 0..1 from motion assist (accelerometer) */
      motionThrottle?: number;
    }
  ): DrivetrainState {
    const { idleRpm, redlineRpm, maxSpeed, shiftStyle, response } = opts;
    dt = Math.min(dt, 0.2);

    // Smooth GPS speed (GPS updates ~1Hz; interpolate between fixes)
    const speedTau = 1.2 - response * 0.9;
    this.smoothedSpeed += (speedMph - this.smoothedSpeed) * Math.min(1, dt / speedTau);

    // Acceleration estimate -> throttle
    const rawAccel = (this.smoothedSpeed - this.lastSpeed) / dt;
    this.lastSpeed = this.smoothedSpeed;
    this.accel += (rawAccel - this.accel) * Math.min(1, dt / 0.6);
    let throttle = Math.min(
      1,
      Math.max(0, 0.15 + this.accel * 0.35 + (this.smoothedSpeed / maxSpeed) * 0.2 + (opts.motionThrottle ?? 0))
    );

    // Gear + drive RPM from speed
    const shiftFrac = SHIFT_RPM[shiftStyle];
    const shiftRpm = idleRpm + (redlineRpm - idleRpm) * shiftFrac;
    const lowRpm = idleRpm + (redlineRpm - idleRpm) * 0.12;
    const sNorm = Math.min(1, this.smoothedSpeed / Math.max(1, maxSpeed));
    let gear = GEAR_TOPS.length;
    let gearLow = 0;
    let gearHigh = 1;
    for (let i = 0; i < GEAR_TOPS.length; i++) {
      if (sNorm <= GEAR_TOPS[i]) {
        gear = i + 1;
        gearLow = i === 0 ? 0 : GEAR_TOPS[i - 1];
        gearHigh = GEAR_TOPS[i];
        break;
      }
    }
    const inGear = gearHigh > gearLow ? (sNorm - gearLow) / (gearHigh - gearLow) : 1;
    let driveRpm =
      this.smoothedSpeed < 0.8
        ? idleRpm
        : (gear === 1 ? idleRpm : lowRpm) + inGear * (shiftRpm - (gear === 1 ? idleRpm : lowRpm));
    // Top gear can pull past the shift point toward redline
    if (gear === GEAR_TOPS.length) driveRpm = lowRpm + inGear * (redlineRpm - lowRpm);

    // Rev override (stationary or on top of drive rpm)
    if (revHeld) {
      const climbRate = (redlineRpm - idleRpm) * (1.2 + response * 1.6);
      this.revRpm = Math.min(redlineRpm, Math.max(this.revRpm, driveRpm, idleRpm) + climbRate * dt);
      throttle = 1;
    } else {
      const fallRate = (redlineRpm - idleRpm) * 1.4;
      this.revRpm = Math.max(0, this.revRpm - fallRate * dt);
    }

    const target = Math.max(driveRpm, this.revRpm, idleRpm);
    const rpmTau = 0.35 - response * 0.25;
    this.rpm += (target - this.rpm) * Math.min(1, dt / Math.max(0.05, rpmTau));

    return { rpm: this.rpm, gear, throttle };
  }

  reset(idleRpm: number) {
    this.rpm = idleRpm;
    this.revRpm = 0;
  }
}
