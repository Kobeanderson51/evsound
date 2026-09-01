export type ShiftStyle = "relaxed" | "medium" | "sport";

/** Real-ish 6-speed ratios + final drive; scaled so top gear tops out near redline */
const GEAR_RATIOS = [3.66, 2.13, 1.45, 1.0, 0.79, 0.63];
const FINAL_DRIVE = 3.15;

const SHIFT_TUNING: Record<ShiftStyle, { up: number; down: number; lockout: number }> = {
  relaxed: { up: 0.76, down: 0.34, lockout: 0.52 },
  medium: { up: 0.88, down: 0.42, lockout: 0.42 },
  sport: { up: 0.96, down: 0.52, lockout: 0.34 },
};

export type DrivetrainState = {
  rpm: number;
  gear: number;
  throttle: number;
};

export class Drivetrain {
  private gpsSm = 0; // EMA of raw GPS speed
  private speed = 0; // regime-followed speed used for rpm
  private trend = 0; // mph/s from the GPS EMA
  private accel = 0; // mph/s from the followed speed (drives load)
  private load = 0; // -1..1 engine load
  private hardMode = false;
  private gear = 1;
  private lockout = 0;
  private revRpm = 0;
  /** seconds remaining of downshift rev-match blip */
  private blip = 0;
  /** seconds remaining of upshift throttle cut */
  private cut = 0;
  /** seconds remaining of lift-off overrun (throttle forced closed) */
  private liftoff = 0;
  private wasOpen = false;
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
    dt = Math.min(Math.max(dt, 1e-3), 0.2);
    const respScale = 1.3 - response * 0.8; // scales every smoothing tau

    // --- GPS smoothing + short predictive lead (hides the ~1Hz GPS latency) ---
    const prevGps = this.gpsSm;
    this.gpsSm += (speedMph - this.gpsSm) * (1 - Math.exp(-dt / (0.3 * respScale)));
    const rawTrend = (this.gpsSm - prevGps) / dt;
    this.trend += (rawTrend - this.trend) * (1 - Math.exp(-dt / 0.35));
    let target = this.gpsSm + Math.max(-8, Math.min(8, this.trend * 0.9));
    if (target < 1.5 && Math.abs(this.trend) < 1) target = 0; // low-speed dead zone

    // --- regime-based following: hard accel snaps, cruise glides ---
    if (this.trend > 3.0) this.hardMode = true;
    else if (this.trend < 2.0) this.hardMode = false;
    const tau = (this.trend < -1 ? 0.45 : this.hardMode ? 0.28 : 0.9) * respScale;
    this.speed += (target - this.speed) * (1 - Math.exp(-dt / tau));

    // --- engine load from acceleration ---
    const rawAccel = this.trend;
    this.accel += (rawAccel - this.accel) * (1 - Math.exp(-dt / 0.45));
    const motion = opts.motionThrottle ?? 0;
    let loadTarget = Math.max(-1, Math.min(1, this.accel / 6 + motion));
    // Lift-off: when the throttle closes hard, hold the engine in overrun briefly
    const open = loadTarget > 0.06 || this.speed < 1;
    if (this.wasOpen && !open && this.speed > 8) this.liftoff = 0.7;
    this.wasOpen = open;
    if (this.liftoff > 0) {
      this.liftoff -= dt;
      loadTarget = -0.85;
    }
    this.load += (loadTarget - this.load) * (1 - Math.exp(-dt / 0.22));

    // --- gears: pick from real ratios, shift with hysteresis + lockout ---
    const tuning = SHIFT_TUNING[shiftStyle];
    // scale so top gear at maxSpeed sits at 95% of redline
    const k = (0.95 * redlineRpm) / (Math.max(20, maxSpeed) * GEAR_RATIOS[5] * FINAL_DRIVE);
    const rpmInGear = (g: number) => Math.max(idleRpm, this.speed * GEAR_RATIOS[g] * FINAL_DRIVE * k);
    this.lockout = Math.max(0, this.lockout - dt);
    const g = this.gear - 1;
    if (this.lockout <= 0 && this.speed > 2) {
      if (this.gear < 6 && rpmInGear(g) > tuning.up * redlineRpm) {
        this.gear++;
        this.lockout = tuning.lockout;
        this.cut = 0.18; // brief lift between gears
        this.blip = 0;
      } else if (this.gear > 1 && rpmInGear(g) < tuning.down * redlineRpm && rpmInGear(g - 1) < tuning.up * redlineRpm * 0.98) {
        this.gear--;
        this.lockout = tuning.lockout;
        this.blip = 0.28; // heel-toe style rev-match burst
        this.cut = 0;
      }
    }
    if (this.speed < 1.5) this.gear = 1;
    const driveRpm = this.speed < 0.8 ? idleRpm : Math.min(redlineRpm, rpmInGear(this.gear - 1));

    // --- throttle output (0..1; <0.15 reads as overrun to the synth) ---
    let throttle = Math.max(0, Math.min(1, 0.5 + this.load * 0.58));
    if (this.blip > 0) {
      this.blip -= dt;
      throttle = Math.max(throttle, 0.85);
    } else if (this.cut > 0) {
      this.cut -= dt;
      throttle = Math.min(throttle, 0.05);
    }

    // --- rev override (stationary or on top of drive rpm) ---
    if (revHeld) {
      const climbRate = (redlineRpm - idleRpm) * (1.2 + response * 1.6);
      this.revRpm = Math.min(redlineRpm, Math.max(this.revRpm, driveRpm, idleRpm) + climbRate * dt);
      throttle = 1;
    } else if (this.revRpm > 0) {
      const fallRate = (redlineRpm - idleRpm) * 1.4;
      this.revRpm = Math.max(0, this.revRpm - fallRate * dt);
      if (this.revRpm > driveRpm + 200) throttle = 0; // falling revs = closed throttle
    }

    // --- rpm follow + slew limit (fast falls allowed, rises bounded) ---
    const targetRpm = Math.max(driveRpm, this.revRpm, idleRpm);
    const rpmTau = Math.max(0.05, 0.3 - response * 0.2);
    let next = this.rpm + (targetRpm - this.rpm) * Math.min(1, dt / rpmTau);
    const maxRise = (2200 + response * 2400) * dt;
    const maxFall = 9000 * dt;
    next = Math.min(this.rpm + maxRise, Math.max(this.rpm - maxFall, next));
    this.rpm = next;

    return { rpm: this.rpm, gear: this.gear, throttle };
  }

  reset(idleRpm: number) {
    this.rpm = idleRpm;
    this.revRpm = 0;
    this.gear = 1;
    this.blip = 0;
    this.cut = 0;
    this.liftoff = 0;
    this.lockout = 0;
    this.gpsSm = 0;
    this.speed = 0;
    this.trend = 0;
    this.accel = 0;
    this.load = 0;
  }
}
