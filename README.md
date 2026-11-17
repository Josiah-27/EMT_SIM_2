# Single-stub matching in 3D

An interactive site that solves and explains this problem:

> A 50 Ω transmission line is connected to a load impedance of (35 − j47.5) Ω.
> Find the length and distance of a short-circuited stub to match the line using the Smith chart.

- **3D view** (three.js): a two-wire line on a low-poly island. The ribbon is the live voltage,
  the thin white lines are its envelope (the standing wave), and the small markers show power
  going to the load and coming back. Attach the stub and the wave on the generator side goes flat.
- **Smith chart** (2D canvas): the same four steps you would draw by hand: plot z_L, flip to y_L,
  walk toward the generator to the g = 1 circle, then cancel the leftover susceptance with the stub.
- **Sliders** for the stub position `d` and length `l`, and inputs to change Z0, the load, or the stub end.

## Answers

| | d (from load) | l (short-circuited stub) | y at the stub |
|---|---|---|---|
| Solution 1 | 0.059 λ | 0.111 λ | 1 + j1.19 |
| Solution 2 | 0.223 λ | 0.389 λ | 1 − j1.19 |

z_L = 0.70 − j0.95, y_L = 0.50 + j0.68, |Γ| = 0.512, VSWR = 3.09.

Note on solution 2: some answer keys list d₂ ≈ 0.112 λ. At 0.112 λ the line admittance is
2.41 + j1.20, which is not on the g = 1 circle, so no stub can match there. The second crossing
is at 0.3323 − 0.1085 = 0.2238 on the chart scale (0.2235 λ exactly). `tests/emt.test.mjs` checks this.

## Run it

No build step. Serve the folder with any static server:

```
npm start        # python3 -m http.server 8080
npm test         # checks the maths against the worked answers
```

## Files

- `js/emt.js`: transmission-line maths (Γ, admittance along the line, stub solutions, voltage phasors)
- `js/smith.js`: Smith chart drawing
- `js/scene.js`: 3D scene
- `js/main.js`: steps, controls, readouts
- `vendor/`: three.js r187 (MIT licence)
