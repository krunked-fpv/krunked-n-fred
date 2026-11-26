import {
  NON_GRABBABLE_TERRAINS,
  type BossChainState,
  type CircuitButtonDef,
  type CircuitDef,
  type CollectibleDef,
  type ColorPlatformDef,
  type DarkZoneDef,
  type FallingBlockDef,
  type GameMode,
  type LaserDef,
  type LevelData,
  type MovablePlatformDef,
  type SignDef,
  type SlopeDef,
  type SwingPlatformDef,
  type TerrainType,
  type TileCell,
  type TileKind,
  type TronchoDef,
  type Vec2,
  type WindZoneDef,
} from '../contracts';

export function tileKey(tx: number, ty: number): string {
  return `${tx},${ty}`;
}

export interface LevelBuilderConfig {
  id: string;
  name: string;
  mode: GameMode;
  timeTrialIndex?: number;
  summitY?: number;
  bounds?: { minX: number; maxX: number; minY: number; maxY: number };
}

type OptionalId<T extends { id: string }> = Omit<T, 'id'> & { id?: string };

/**
 * Pure deterministic tilemap & entity builder for Krunked & Fred levels.
 * Computes 4-bit cardinal auto-tile masks (N=1, E=2, S=4, W=8 in Y-UP space)
 * and terrain grab eligibility automatically on build().
 */
export class LevelBuilder {
  private readonly id: string;
  private readonly name: string;
  private readonly mode: GameMode;
  private readonly timeTrialIndex?: number;
  private spawnP1: Vec2 = { x: 0, y: 1.6 };
  private spawnP2: Vec2 = { x: 1.5, y: 1.6 };
  private summitY: number;
  private summitZone: { x: number; y: number; w: number; h: number } = { x: 0, y: 100, w: 6, h: 4 };
  private explicitBounds?: { minX: number; maxX: number; minY: number; maxY: number };

  private readonly tiles = new Map<string, TileCell>();
  private readonly slopes: SlopeDef[] = [];
  private readonly fallingBlocks: FallingBlockDef[] = [];
  private readonly movablePlatforms: MovablePlatformDef[] = [];
  private readonly swingPlatforms: SwingPlatformDef[] = [];
  private readonly windZones: WindZoneDef[] = [];
  private readonly darkZones: DarkZoneDef[] = [];
  private readonly circuits: CircuitDef[] = [];
  private readonly buttons: CircuitButtonDef[] = [];
  private readonly lasers: LaserDef[] = [];
  private readonly tronchos: TronchoDef[] = [];
  private readonly colorPlatforms: ColorPlatformDef[] = [];
  private readonly collectibles: CollectibleDef[] = [];
  private readonly signs: SignDef[] = [];
  private readonly waypoints: Vec2[] = [];
  private bossArena?: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    chains: BossChainState[];
  };

  constructor(config: LevelBuilderConfig) {
    this.id = config.id;
    this.name = config.name;
    this.mode = config.mode;
    this.timeTrialIndex = config.timeTrialIndex;
    this.summitY = config.summitY ?? 152;
    this.explicitBounds = config.bounds ? { ...config.bounds } : undefined;
  }

  public setTile(
    tx: number,
    ty: number,
    kind: TileKind,
    terrain: TerrainType,
    grabbableOverride?: boolean,
  ): this {
    const ix = Math.floor(tx);
    const iy = Math.floor(ty);
    const grabbable =
      grabbableOverride !== undefined
        ? grabbableOverride
        : kind !== 'ONE_WAY' && kind !== 'ICE' && !NON_GRABBABLE_TERRAINS.has(terrain);

    this.tiles.set(tileKey(ix, iy), {
      tx: ix,
      ty: iy,
      kind,
      terrain,
      grabbable,
      mask: 0,
    });
    return this;
  }

  public clearRect(x: number, y: number, w: number, h: number): this {
    const sx = Math.floor(x);
    const sy = Math.floor(y);
    const iw = Math.floor(w);
    const ih = Math.floor(h);
    for (let dy = 0; dy < ih; dy++) {
      for (let dx = 0; dx < iw; dx++) {
        this.tiles.delete(tileKey(sx + dx, sy + dy));
      }
    }
    return this;
  }

  public fillRect(
    x: number,
    y: number,
    w: number,
    h: number,
    terrain: TerrainType = 'SNOW',
    kind: TileKind = 'SOLID',
  ): this {
    const sx = Math.floor(x);
    const sy = Math.floor(y);
    const iw = Math.floor(w);
    const ih = Math.floor(h);
    for (let dy = 0; dy < ih; dy++) {
      for (let dx = 0; dx < iw; dx++) {
        this.setTile(sx + dx, sy + dy, kind, terrain);
      }
    }
    return this;
  }

  public fillIce(x: number, y: number, w: number, h = 1): this {
    return this.fillRect(x, y, w, h, 'ICE', 'ICE');
  }

  public addOneWay(x: number, y: number, w: number, terrain: TerrainType = 'PLATFORM'): this {
    return this.fillRect(x, y, w, 1, terrain, 'ONE_WAY');
  }

  public addSlope(def: OptionalId<SlopeDef>): this {
    const id = def.id ?? `slope_${this.slopes.length + 1}`;
    this.slopes.push({ ...def, id });
    return this;
  }

  public addFallingBlock(def: OptionalId<FallingBlockDef>): this {
    const id = def.id ?? `fb_${this.fallingBlocks.length + 1}`;
    this.fallingBlocks.push({ ...def, id });
    return this;
  }

  public addMovable(def: OptionalId<MovablePlatformDef>): this {
    const id = def.id ?? `mov_${this.movablePlatforms.length + 1}`;
    this.movablePlatforms.push({ ...def, id });
    return this;
  }

  public addSwingPlatform(def: OptionalId<SwingPlatformDef>): this {
    const id = def.id ?? `swing_${this.swingPlatforms.length + 1}`;
    this.swingPlatforms.push({ ...def, id });
    return this;
  }

  public addWindZone(def: OptionalId<WindZoneDef>): this {
    const id = def.id ?? `wind_${this.windZones.length + 1}`;
    this.windZones.push({ ...def, id });
    return this;
  }

  public addDarkZone(def: DarkZoneDef): this {
    this.darkZones.push({ ...def });
    return this;
  }

  public addCircuit(def: CircuitDef): this {
    this.circuits.push({ id: def.id, nodes: def.nodes.map((n) => ({ ...n })) });
    return this;
  }

  public addButton(def: OptionalId<CircuitButtonDef>): this {
    const id = def.id ?? `btn_${this.buttons.length + 1}`;
    this.buttons.push({ ...def, id });
    return this;
  }

  public addLaser(def: OptionalId<LaserDef>): this {
    const id = def.id ?? `laser_${this.lasers.length + 1}`;
    this.lasers.push({ ...def, id });
    return this;
  }

  public addTroncho(def: OptionalId<TronchoDef>): this {
    const id = def.id ?? `troncho_${this.tronchos.length + 1}`;
    this.tronchos.push({ ...def, id });
    return this;
  }

  public addColorPlatform(def: OptionalId<ColorPlatformDef>): this {
    const id = def.id ?? `color_${this.colorPlatforms.length + 1}`;
    this.colorPlatforms.push({ ...def, id });
    return this;
  }

  public addCollectible(def: CollectibleDef): this {
    this.collectibles.push({ ...def });
    return this;
  }

  public addSign(def: SignDef): this {
    this.signs.push({ ...def });
    return this;
  }

  public addWaypoint(x: number, y: number): this {
    this.waypoints.push({ x, y });
    return this;
  }

  public addWaypoints(points: readonly Vec2[]): this {
    for (let i = 0; i < points.length; i++) {
      this.waypoints.push({ x: points[i].x, y: points[i].y });
    }
    return this;
  }

  public setSpawn(p1: Vec2, p2: Vec2): this {
    this.spawnP1 = { x: p1.x, y: p1.y };
    this.spawnP2 = { x: p2.x, y: p2.y };
    return this;
  }

  public setSummitZone(x: number, y: number, w: number, h: number, summitY?: number): this {
    this.summitZone = { x, y, w, h };
    if (summitY !== undefined) {
      this.summitY = summitY;
    } else {
      this.summitY = y;
    }
    return this;
  }

  public setBounds(minX: number, maxX: number, minY: number, maxY: number): this {
    this.explicitBounds = { minX, maxX, minY, maxY };
    return this;
  }

  public setBossArena(arena: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    chains: BossChainState[];
  }): this {
    this.bossArena = {
      ...arena,
      chains: arena.chains.map((c) => ({ ...c })),
    };
    return this;
  }

  public build(): LevelData {
    const builtTiles = new Map<string, TileCell>();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    // First clone cells and compute auto-tile cardinal bitmask: N=1 (ty+1), E=2 (tx+1), S=4 (ty-1), W=8 (tx-1)
    for (const [key, cell] of this.tiles.entries()) {
      const isOneWay = cell.kind === 'ONE_WAY';
      let mask = 0;

      const north = this.tiles.get(tileKey(cell.tx, cell.ty + 1));
      const east = this.tiles.get(tileKey(cell.tx + 1, cell.ty));
      const south = this.tiles.get(tileKey(cell.tx, cell.ty - 1));
      const west = this.tiles.get(tileKey(cell.tx - 1, cell.ty));

      if (isOneWay) {
        if (east) mask |= 2;
        if (west) mask |= 8;
      } else {
        if (north && north.kind !== 'ONE_WAY') mask |= 1;
        if (east && east.kind !== 'ONE_WAY') mask |= 2;
        if (south && south.kind !== 'ONE_WAY') mask |= 4;
        if (west && west.kind !== 'ONE_WAY') mask |= 8;
      }

      const grabbable =
        cell.grabbable &&
        cell.kind !== 'ONE_WAY' &&
        cell.kind !== 'ICE' &&
        !NON_GRABBABLE_TERRAINS.has(cell.terrain);

      builtTiles.set(key, {
        tx: cell.tx,
        ty: cell.ty,
        kind: cell.kind,
        terrain: cell.terrain,
        grabbable,
        mask,
      });

      if (cell.tx < minX) minX = cell.tx;
      if (cell.tx + 1 > maxX) maxX = cell.tx + 1;
      if (cell.ty < minY) minY = cell.ty;
      if (cell.ty + 1 > maxY) maxY = cell.ty + 1;
    }

    const tileList = Array.from(builtTiles.values()).sort((a, b) =>
      a.ty !== b.ty ? a.ty - b.ty : a.tx - b.tx,
    );

    const bounds = this.explicitBounds
      ? { ...this.explicitBounds }
      : {
          minX: Number.isFinite(minX) ? minX : -22,
          maxX: Number.isFinite(maxX) ? maxX : 34,
          minY: Number.isFinite(minY) ? minY : -2,
          maxY: Number.isFinite(maxY) ? Math.max(maxY, this.summitY + 10) : this.summitY + 10,
        };

    return {
      id: this.id,
      name: this.name,
      mode: this.mode,
      timeTrialIndex: this.timeTrialIndex,
      spawnP1: { ...this.spawnP1 },
      spawnP2: { ...this.spawnP2 },
      summitY: this.summitY,
      summitZone: { ...this.summitZone },
      bounds,
      tiles: builtTiles,
      tileList,
      slopes: this.slopes.map((s) => ({ ...s })),
      fallingBlocks: this.fallingBlocks.map((b) => ({ ...b })),
      movablePlatforms: this.movablePlatforms.map((m) => ({ ...m })),
      swingPlatforms: this.swingPlatforms.map((s) => ({ ...s })),
      windZones: this.windZones.map((w) => ({ ...w })),
      darkZones: this.darkZones.map((d) => ({ ...d })),
      circuits: this.circuits.map((c) => ({ id: c.id, nodes: c.nodes.map((n) => ({ ...n })) })),
      buttons: this.buttons.map((b) => ({ ...b })),
      lasers: this.lasers.map((l) => ({ ...l })),
      tronchos: this.tronchos.map((t) => ({ ...t })),
      colorPlatforms: this.colorPlatforms.map((c) => ({ ...c })),
      collectibles: this.collectibles.map((c) => ({ ...c })),
      signs: this.signs.map((s) => ({ ...s })),
      bossArena: this.bossArena
        ? {
            ...this.bossArena,
            chains: this.bossArena.chains.map((c) => ({ ...c })),
          }
        : undefined,
      waypoints: this.waypoints.map((w) => ({ ...w })),
    };
  }
}
