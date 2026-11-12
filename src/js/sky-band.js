/* astro.js: dependency-free sun / moon / planet / bright-star positions.
 * Angles in degrees. Azimuth from north, clockwise (N=0, E=90, S=180, W=270).
 * Altitudes are geometric (no refraction). Sun, moon, planets are topocentric (WGS84).
 * Sources: Meeus, Astronomical Algorithms 2nd ed. (sun ch.25, moon ch.47, nutation ch.22,
 * IAU 1976 precession ch.21, sidereal time ch.12); JPL/Standish Keplerian elements
 * 1800-2050 (Table 1) for planets; Mallama & Hilton 2018 magnitudes;
 * stars V <= 3.0 from the HYG v4.1 catalog (J2000). TT - UT fixed at 69 s.
 * Verified against Skyfield + DE421, see verify/verify.py.
 */
(function () {
  'use strict';
  var RD = Math.PI / 180, DG = 180 / Math.PI;
  var AU = 149597870.7, C_AU = 173.1446327, DT = 69 / 86400, EPS2000 = 23.4392911;

  function sn(x) { return Math.sin(x * RD); }
  function cs(x) { return Math.cos(x * RD); }
  function asn(x) { return Math.asin(x > 1 ? 1 : x < -1 ? -1 : x) * DG; }
  function at2(y, x) { return Math.atan2(y, x) * DG; }
  function n360(x) { x %= 360; return x < 0 ? x + 360 : x; }
  function w180(x) { return n360(x + 180) - 180; }
  function jdOf(d) { return +d / 864e5 + 2440587.5; }
  function dateOf(j) { return new Date(Math.round((j - 2440587.5) * 864e5)); }

  // vectors: r* rotate a vector by +a degrees about the x / y / z axis
  function rx(v, a) { var c = cs(a), s = sn(a); return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]]; }
  function ry(v, a) { var c = cs(a), s = sn(a); return [c * v[0] - s * v[2], v[1], s * v[0] + c * v[2]]; }
  function rz(v, a) { var c = cs(a), s = sn(a); return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]]; }
  function sph(lon, lat, r) { var c = r * cs(lat); return [c * cs(lon), c * sn(lon), r * sn(lat)]; }
  function len(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function scl(v, k) { return [v[0] * k, v[1] * k, v[2] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  // per-instant context: TT centuries, nutation, obliquity, apparent sidereal time (1-entry cache)
  var lastJ, lastC;
  function ctx(j) {
    if (j === lastJ) return lastC;
    var T = (j + DT - 2451545) / 36525, d = j - 2451545, Tu = d / 36525;
    var om = 125.04452 - 1934.136261 * T, ls = 280.4665 + 36000.7698 * T, lm = 218.3165 + 481267.8813 * T;
    var dpsi = (-17.2 * sn(om) - 1.32 * sn(2 * ls) - 0.23 * sn(2 * lm) + 0.21 * sn(2 * om)) / 3600;
    var deps = (9.2 * cs(om) + 0.57 * cs(2 * ls) + 0.1 * cs(2 * lm) - 0.09 * cs(2 * om)) / 3600;
    var e0 = 23.4392911 - (46.815 * T + 0.00059 * T * T - 0.001813 * T * T * T) / 3600;
    var gmst = 280.46061837 + 360.98564736629 * d + (0.000387933 - Tu / 38710000) * Tu * Tu;
    lastJ = j;
    lastC = { T: T, dpsi: dpsi, e0: e0, e: e0 + deps, gast: n360(gmst + dpsi * cs(e0 + deps)) };
    return lastC;
  }

  // observer geocentric position, km, true equator of date
  function obs(c, lat, lon) {
    var e2 = 0.00669437999014, s = sn(lat), N = 6378.137 / Math.sqrt(1 - e2 * s * s);
    var th = c.gast + lon, r = N * cs(lat);
    return [r * cs(th), r * sn(th), N * (1 - e2) * s];
  }
  // topocentric vector (true equator of date) -> alt/az
  function horiz(v, c, lat, lon) {
    var ra = at2(v[1], v[0]), dec = at2(v[2], Math.sqrt(v[0] * v[0] + v[1] * v[1]));
    var H = c.gast + lon - ra, sl = sn(lat), cl = cs(lat), sd = sn(dec), cd = cs(dec), ch = cs(H);
    return { alt: asn(sl * sd + cl * cd * ch), az: n360(at2(-cd * sn(H), sd * cl - cd * ch * sl)) };
  }
  // J2000 equatorial vector -> true equator and equinox of date (IAU 1976 precession + nutation)
  function ofDate(v, c) {
    var T = c.T;
    var z1 = (2306.2181 + (0.30188 + 0.017998 * T) * T) * T / 3600;
    var z2 = (2306.2181 + (1.09468 + 0.018203 * T) * T) * T / 3600;
    var th = (2004.3109 - (0.42665 + 0.041833 * T) * T) * T / 3600;
    return rx(rz(rx(rz(ry(rz(v, z1), th), z2), -c.e0), c.dpsi), c.e);
  }

  // ---- Sun (apparent ecliptic longitude of date, distance in AU)
  function sunEcl(c) {
    var T = c.T, M = 357.52911 + (35999.05029 - 0.0001537 * T) * T;
    var e = 0.016708634 - (0.000042037 + 0.0000001267 * T) * T;
    var C = (1.914602 - (0.004817 + 0.000014 * T) * T) * sn(M) +
      (0.019993 - 0.000101 * T) * sn(2 * M) + 0.000289 * sn(3 * M);
    var L = 280.46646 + (36000.76983 + 0.0003032 * T) * T + C;
    return { lon: L - 0.00569 + c.dpsi, r: 1.000001018 * (1 - e * e) / (1 + e * cs(M + C)) };
  }
  function sunTopo(c, lat, lon) {
    var s = sunEcl(c);
    return sub(rx(sph(s.lon, 0, s.r * AU), c.e), obs(c, lat, lon));
  }
  function sun(date, lat, lon) {
    var c = ctx(jdOf(date));
    return horiz(sunTopo(c, lat, lon), c, lat, lon);
  }

  function sunTimes(date, lat, lon) {
    var lw = -lon, n = Math.round(jdOf(date) - 2451545 - 0.0009 - lw / 360);
    var noon = 2451545 + 0.0009 + lw / 360 + n, i, c, v;
    function ha(t) { // topocentric local hour angle and declination of the sun at JD t
      c = ctx(t); v = sunTopo(c, lat, lon);
      return [w180(c.gast + lon - at2(v[1], v[0])), at2(v[2], Math.sqrt(v[0] * v[0] + v[1] * v[1]))];
    }
    for (i = 0; i < 4; i++) noon -= ha(noon)[0] / 360;
    function ev(h0, sg) {
      var t = noon, k, q, ch, dt;
      for (k = 0; k < 8; k++) {
        q = ha(t);
        ch = (sn(h0) - sn(lat) * sn(q[1])) / (cs(lat) * cs(q[1]));
        if (ch < -1 || ch > 1) return null;
        dt = w180(sg * Math.acos(ch) * DG - q[0]) / 360;
        t += dt;
        if (Math.abs(dt) < 1e-8) break;
      }
      return dateOf(t);
    }
    return {
      solarNoon: dateOf(noon),
      sunrise: ev(-0.833, -1), sunset: ev(-0.833, 1),
      civilDawn: ev(-6, -1), civilDusk: ev(-6, 1),
      nauticalDawn: ev(-12, -1), nauticalDusk: ev(-12, 1),
      astroDawn: ev(-18, -1), astroDusk: ev(-18, 1)
    };
  }
  function dayLengthMinutes(date, lat, lon) {
    var t = sunTimes(date, lat, lon);
    if (t.sunrise && t.sunset) return (t.sunset - t.sunrise) / 6e4;
    return sun(t.solarNoon, lat, lon).alt > -0.833 ? 1440 : 0;
  }

  // ---- Moon (Meeus ch.47). Rows: D M M' F sumL sumR, then D M M' F sumB
  var ML = [0,0,1,0,6288774,-20905355,2,0,-1,0,1274027,-3699111,2,0,0,0,658314,-2955968,
    0,0,2,0,213618,-569925,0,1,0,0,-185116,48888,0,0,0,2,-114332,-3149,2,0,-2,0,58793,246158,
    2,-1,-1,0,57066,-152138,2,0,1,0,53322,-170733,2,-1,0,0,45758,-204586,0,1,-1,0,-40923,-129620,
    1,0,0,0,-34720,108743,0,1,1,0,-30383,104755,2,0,0,-2,15327,10321,0,0,1,2,-12528,0,
    0,0,1,-2,10980,79661,4,0,-1,0,10675,-34782,0,0,3,0,10034,-23210,4,0,-2,0,8548,-21636,
    2,1,-1,0,-7888,24208,2,1,0,0,-6766,30824,1,0,-1,0,-5163,-8379,1,1,0,0,4987,-16675,
    2,-1,1,0,4036,-12831,2,0,2,0,3994,-10445,4,0,0,0,3861,-11650,2,0,-3,0,3665,14403,
    0,1,-2,0,-2689,-7003,2,0,-1,2,-2602,0,2,-1,-2,0,2390,10056,1,0,1,0,-2348,6322,
    2,-2,0,0,2236,-9884,0,1,2,0,-2120,5751,0,2,0,0,-2069,0,2,-2,-1,0,2048,-4950,
    2,0,1,-2,-1773,4130,2,0,0,2,-1595,0,4,-1,-1,0,1215,-3958,0,0,2,2,-1110,0,3,0,-1,0,-892,3258,
    2,1,1,0,-810,2616,4,-1,-2,0,759,-1897,0,2,-1,0,-713,-2117,2,2,-1,0,-700,2354,2,1,-2,0,691,0,
    2,-1,0,-2,596,0,4,0,1,0,549,-1423,0,0,4,0,537,-1117,4,-1,0,0,520,-1571,1,0,-2,0,-487,-1739,
    2,1,0,-2,-399,0,0,0,2,-2,-381,-4421,1,1,1,0,351,0,3,0,-2,0,-340,0,4,0,-3,0,330,0,
    2,-1,2,0,327,0,0,2,1,0,-323,1165,1,1,-1,0,299,0,2,0,3,0,294,0,2,0,-1,-2,0,8752];
  var MB = [0,0,0,1,5128122,0,0,1,1,280602,0,0,1,-1,277693,2,0,0,-1,173237,2,0,-1,1,55413,
    2,0,-1,-1,46271,2,0,0,1,32573,0,0,2,1,17198,2,0,1,-1,9266,0,0,2,-1,8822,2,-1,0,-1,8216,
    2,0,-2,-1,4324,2,0,1,1,4200,2,1,0,-1,-3359,2,-1,-1,1,2463,2,-1,0,1,2211,2,-1,-1,-1,2065,
    0,1,-1,-1,-1870,4,0,-1,-1,1828,0,1,0,1,-1794,0,0,0,3,-1749,0,1,-1,1,-1565,1,0,0,1,-1491,
    0,1,1,1,-1475,0,1,1,-1,-1410,0,1,0,-1,-1344,1,0,0,-1,-1335,0,0,3,1,1107,4,0,0,-1,1021,
    4,0,-1,1,833,0,0,1,-3,777,4,0,-2,1,671,2,0,0,-3,607,2,0,2,-1,596,2,-1,1,-1,491,
    2,0,-2,1,-451,0,0,3,-1,439,2,0,2,1,422,2,0,-3,-1,421,2,1,-1,1,-366,2,1,0,1,-351,
    4,0,0,1,331,2,-1,1,1,315,2,-2,0,-1,302,0,0,1,3,-283,2,1,1,-1,-229,1,1,0,-1,223,
    1,1,0,1,223,0,1,-2,-1,-220,2,1,-1,-1,-220,1,0,1,1,-185,2,-1,-2,-1,181,0,1,2,1,-177,
    4,0,-2,-1,176,4,-1,-1,-1,166,1,0,1,-1,-164,4,0,1,-1,132,1,0,-1,-1,-119,4,-1,0,-1,115,
    2,-2,0,1,107];
  // apparent geocentric ecliptic coordinates of date; r in km
  function moonEcl(c) {
    var T = c.T, T2 = T * T, T3 = T2 * T, T4 = T3 * T, i, a, f;
    var Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000;
    var D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000;
    var M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000;
    var Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000;
    var F = 93.272095 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000;
    var A1 = 119.75 + 131.849 * T, A2 = 53.09 + 479264.29 * T, A3 = 313.45 + 481266.484 * T;
    var E = 1 - 0.002516 * T - 0.0000074 * T2;
    var sl = 3958 * sn(A1) + 1962 * sn(Lp - F) + 318 * sn(A2), sr = 0;
    var sb = -2235 * sn(Lp) + 382 * sn(A3) + 175 * sn(A1 - F) + 175 * sn(A1 + F) +
      127 * sn(Lp - Mp) - 115 * sn(Lp + Mp);
    for (i = 0; i < ML.length; i += 6) {
      a = ML[i] * D + ML[i + 1] * M + ML[i + 2] * Mp + ML[i + 3] * F;
      f = ML[i + 1] ? (ML[i + 1] * ML[i + 1] > 1 ? E * E : E) : 1;
      sl += f * ML[i + 4] * sn(a); sr += f * ML[i + 5] * cs(a);
    }
    for (i = 0; i < MB.length; i += 5) {
      a = MB[i] * D + MB[i + 1] * M + MB[i + 2] * Mp + MB[i + 3] * F;
      sb += (MB[i + 1] ? (MB[i + 1] * MB[i + 1] > 1 ? E * E : E) : 1) * MB[i + 4] * sn(a);
    }
    return { lon: Lp + sl / 1e6 + c.dpsi, lat: sb / 1e6, r: 385000.56 + sr / 1000 };
  }
  function moon(date, lat, lon) {
    var c = ctx(jdOf(date)), m = moonEcl(c);
    var v = sub(rx(sph(m.lon, m.lat, m.r), c.e), obs(c, lat, lon));
    var h = horiz(v, c, lat, lon);
    h.distanceKm = len(v);
    return h;
  }
  function moonPhase(date) {
    var c = ctx(jdOf(date)), m = moonEcl(c), s = sunEcl(c);
    var dl = n360(m.lon - s.lon), cp = cs(m.lat) * cs(dl), R = s.r * AU;
    var i = at2(R * Math.sqrt(1 - cp * cp), m.r - R * cp); // phase angle at the moon
    return { fraction: (1 + cs(i)) / 2, phase: dl / 360, waxing: dl < 180 };
  }
  function moonBrightLimb(date, lat, lon) {
    var m = moon(date, lat, lon), s = sun(date, lat, lon), dA = s.az - m.az;
    var x = sn(dA) * cs(s.alt), y = cs(m.alt) * sn(s.alt) - sn(m.alt) * cs(s.alt) * cs(dA);
    var L = Math.sqrt(x * x + y * y) || 1;
    return { dx: x / L, dy: y / L };
  }

  // ---- Planets: JPL Table 1 elements (a, e, I, L, long.peri, long.node) + rates per century
  var PL = [
    0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593,
    0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081,
    0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255,
    0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418,
    1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0,
    0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0,
    1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891,
    0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343,
    5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909,
    -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106,
    9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448,
    -0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794];
  // heliocentric position, AU, J2000 ecliptic
  function kepler(k, T) {
    var o = k * 12, el = [], i;
    for (i = 0; i < 6; i++) el[i] = PL[o + i] + PL[o + 6 + i] * T;
    var e = el[1], M = w180(el[3] - el[4]) * RD, E = M + e * Math.sin(M);
    for (i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    return rz(rx(rz([el[0] * (Math.cos(E) - e), el[0] * Math.sqrt(1 - e * e) * Math.sin(E), 0],
      el[4] - el[5]), el[2]), el[5]);
  }
  // Earth heliocentric position (EMB minus lunar offset) and velocity, J2000 ecliptic
  function earth(c) {
    if (!c.ep) {
      var b = kepler(2, c.T), b0 = kepler(2, c.T - 0.01 / 36525), m = moonEcl(c);
      c.ep = sub(b, sph(m.lon - c.dpsi - 1.3969713 * c.T, m.lat, m.r / AU / 82.30057));
      c.ev = scl(sub(b, b0), 100);
    }
    return c;
  }
  // aberration: add Earth velocity / c to a unit vector (J2000 ecliptic)
  function aberr(u, c) { return [u[0] + c.ev[0] / C_AU, u[1] + c.ev[1] / C_AU, u[2] + c.ev[2] / C_AU]; }
  var SAT_POLE = rx([0.08547883, 0.07323576, 0.99364475], -EPS2000);
  var PNAMES = ['Mercury', 'Venus', '', 'Mars', 'Jupiter', 'Saturn'];
  function pmag(k, r, d, a, p, g) {
    var m = 5 * Math.log10(r * d), a2 = a * a;
    if (k === 0) return m - 0.613 + a * (6.328e-2 + a * (-1.6336e-3 + a * (3.3644e-5 +
      a * (-3.4265e-7 + a * (1.6893e-9 - 3.0334e-12 * a)))));
    if (k === 1) return a < 163.7 ? m - 4.384 + a * (-1.044e-3 + a * (3.687e-4 + a * (-2.814e-6 + 8.938e-9 * a)))
      : m + 236.05828 - 2.81914 * a + 8.39034e-3 * a2;
    if (k === 3) return a <= 50 ? m - 1.601 + 2.267e-2 * a - 1.302e-4 * a2 : m - 0.367 - 0.02573 * a + 3.445e-4 * a2;
    if (k === 4) return m - 9.395 - 3.7e-4 * a + 6.16e-4 * a2;
    var b1 = -asn(dot(SAT_POLE, p) / r), b2 = -asn(dot(SAT_POLE, g) / d), q = b1 * b2;
    var sb = q > 0 ? sn(Math.sqrt(q)) : 0; // ring tilt term (saturnicentric latitudes of Sun, Earth)
    return m - 8.914 - 1.825 * sb + 0.026 * a - 0.378 * sb * Math.exp(-2.25 * a);
  }
  function planets(date, lat, lon) {
    var c = earth(ctx(jdOf(date))), ob = obs(c, lat, lon), out = [], ks = [0, 1, 3, 4, 5], i, j, k, p, g, d, tau;
    for (i = 0; i < 5; i++) {
      k = ks[i]; tau = 0;
      for (j = 0; j < 3; j++) { p = kepler(k, c.T - tau / 36525); g = sub(p, c.ep); d = len(g); tau = d / C_AU; }
      var u = ofDate(rx(aberr(scl(g, 1 / d), c), EPS2000), c);
      var h = horiz(sub(scl(u, d * AU / len(u)), ob), c, lat, lon);
      var r = len(p), ph = Math.acos(Math.max(-1, Math.min(1, dot(p, g) / (r * d)))) * DG;
      out.push({ name: PNAMES[k], alt: h.alt, az: h.az, mag: pmag(k, r, d, ph, p, g) });
    }
    return out;
  }

  // ---- Stars: J2000 RA/Dec (deg), V mag. Proper motion is not applied.
  function starAltAz(ra, dec, date, lat, lon) {
    var c = earth(ctx(jdOf(date)));
    var u = rx(aberr(rx(sph(ra, dec, 1), -EPS2000), c), EPS2000);
    return horiz(ofDate(u, c), c, lat, lon);
  }
  var SN = "Sirius|Canopus|Arcturus|Rigil Kentaurus|Vega|Capella|Rigel|Procyon|Achernar|Betelgeuse|Hadar|Altair|Acrux|Aldebaran|Spica|Antares|Pollux|Fomalhaut|Mimosa|Deneb|Regulus|Adhara|Castor|Gacrux|Shaula|Bellatrix|Elnath|Miaplacidus|Alnilam|Alnair|Alnitak|\u03b3\u00b2 Vel|Alioth|Mirfak|Kaus Australis|Dubhe|Wezen|Alkaid|Avior|Sargas|Menkalinan|Atria|Alhena|Alsephina|Peacock|Polaris|Mirzam|Alphard|Hamal|Algieba|Diphda|Nunki|Menkent|Alpheratz|Mirach|Saiph|Kochab|Tiaki|Rasalhague|Algol|Almach|Denebola|Cih|\u03b3 Cen|Naos|Aspidiske|Alphecca|Suhail|Mizar|Sadr|Schedar|Eltanin|Mintaka|Caph|\u03b5 Cen|Dschubba|Larawag|\u03b1 Lup|\u03b7 Cen|Merak|Izar|Enif|\u03ba Sco|Ankaa|Phecda|Sabik|Scheat|Aludra|Alderamin|Markeb|Aljanah|Markab|Menkar|\u03b6 Oph|\u03b6 Cen|Zosma|Acrab|Arneb|\u03b4 Cen|Gienah|Ascella|Zubeneschamali|Unukalhai|Sheratan|Phact|Mahasim|Kraz|Ruchbah|Muphrid|\u03b2 Lup|Hassaleh|\u03bc Vel|\u03b1 Mus|Lesath|\u03c0 Pup|Kaus Media|Tarazed|Yed Prior|Athebyne|\u03b8 Car|Porrima|Hatysa|\u03b9 Cen|Zubenelgenubi|Cebalrai|Cursa|Kornephoros|Rasalgethi|Imai|Rastaban|\u03b3 Lup|Nihal|\u03b6 Her|\u03b2 Hyi|Paikauhale|Kaus Borealis|Algenib|Tureis|\u03b2 TrA|\u03b6 Per|\u03b2 Ara|\u03b1 Ara|Alcyone|Vindemiatrix|Deneb Algedi|\u03b1 Hyi|Fawaris|Tejat|\u03b3 TrA|\u03b1 Tuc|Acamar|Albaldah|Gomeisa|Cor Caroli|Fang|\u03b5 Per|Alniyat|Sadalsuud|\u03b3 Per|\u03c5 Car|Matar|\u03c4 Pup|Algorab|Sadalmelik|Zaurak|Tianguan|Ras Elased Australis|Alnasl|\u03b3 Hya|\u03b9\u00b9 Sco|Okab|\u03b2 Tri|\u03c8 UMa|Pherkad|Xamidimura|Aldhanab", SD = [101.2872,-16.7161,-1.44,95.9879,-52.6957,-.62,213.9154,19.1824,-.05,219.9115,-60.834,-.01,279.2346,38.7837,.03,79.1723,45.998,.08,78.6345,-8.2016,.18,114.8255,5.225,.4,24.4283,-57.2368,.45,88.7929,7.4071,.45,210.9559,-60.373,.61,297.6958,8.8683,.76,186.6497,-63.0991,.77,68.9802,16.5093,.87,201.2982,-11.1613,.98,247.3519,-26.432,1.06,116.3292,28.0262,1.16,344.4126,-29.6222,1.17,191.9304,-59.6888,1.25,310.358,45.2803,1.25,152.093,11.9672,1.36,104.6565,-28.9721,1.5,113.6495,31.8883,1.58,187.7914,-57.1132,1.59,263.4022,-37.1038,1.62,81.2828,6.3497,1.64,81.573,28.6075,1.65,138.3006,-69.7172,1.67,84.0534,-1.2019,1.69,332.0581,-46.961,1.73,85.1897,-1.9426,1.74,122.3831,-47.3366,1.75,193.5071,55.9598,1.76,51.0807,49.8612,1.79,276.043,-34.3846,1.79,165.9323,61.751,1.81,107.0979,-26.3932,1.83,206.8853,49.3133,1.85,125.6285,-59.5095,1.86,264.3297,-42.9978,1.86,89.8822,44.9474,1.9,252.1662,-69.0277,1.91,99.4279,16.3993,1.93,131.1759,-54.7088,1.93,306.4119,-56.7351,1.94,37.9462,89.2641,1.97,95.6749,-17.9559,1.98,141.8969,-8.6586,1.99,31.7933,23.4624,2.01,154.9931,19.8415,2.01,10.8973,-17.9866,2.04,283.8163,-26.2967,2.05,211.6709,-36.37,2.06,2.0969,29.0904,2.07,17.4329,35.6206,2.07,86.9391,-9.6696,2.07,222.6766,74.1555,2.07,340.6667,-46.8846,2.07,263.7336,12.56,2.08,47.0422,40.9556,2.09,30.9748,42.3297,2.1,177.2649,14.5721,2.14,14.1771,60.7167,2.15,190.3796,-48.9599,2.2,120.8961,-40.0031,2.21,139.2726,-59.2752,2.21,233.6719,26.7147,2.22,136.999,-43.4326,2.23,200.9812,54.9254,2.23,305.5571,40.2567,2.23,10.1267,56.5373,2.24,269.1516,51.4889,2.24,83.0017,-.2991,2.25,2.2933,59.1498,2.28,204.9719,-53.4664,2.29,240.0834,-22.6217,2.29,252.5412,-34.2932,2.29,220.4823,-47.3882,2.3,218.8768,-42.1578,2.33,165.4602,56.3824,2.34,221.2468,27.0742,2.35,326.0465,9.875,2.38,265.622,-39.03,2.39,6.5708,-42.306,2.4,178.4575,53.6948,2.41,257.5945,-15.7249,2.43,345.9435,28.0828,2.44,111.0238,-29.3031,2.45,319.6445,62.5856,2.45,140.5284,-55.0107,2.47,311.5527,33.9703,2.48,346.1902,15.2053,2.49,45.5699,4.0897,2.54,249.2897,-10.5671,2.54,208.885,-47.2884,2.55,168.5271,20.5237,2.56,241.3593,-19.8055,2.56,83.1826,-17.8223,2.58,182.0897,-50.7224,2.58,183.9516,-17.5419,2.58,285.653,-29.8801,2.6,229.2517,-9.3829,2.61,236.067,6.4256,2.63,28.66,20.808,2.64,84.9123,-34.0741,2.65,89.9303,37.2126,2.65,188.5968,-23.3968,2.65,21.4532,60.2353,2.66,208.6712,18.3977,2.68,224.6331,-43.134,2.68,74.2484,33.1661,2.69,161.6923,-49.4203,2.69,189.2961,-69.1356,2.69,262.691,-37.2958,2.7,109.2857,-37.0975,2.71,275.2485,-29.8281,2.72,296.5649,10.6133,2.72,243.5864,-3.6943,2.73,245.9979,61.5142,2.73,160.7392,-64.3945,2.74,190.4152,-1.4494,2.74,83.8583,-5.9099,2.75,200.1494,-36.7123,2.75,222.7197,-16.0418,2.75,265.8681,4.5673,2.76,76.9624,-5.0864,2.78,247.555,21.4896,2.78,258.6619,14.3903,2.78,183.7864,-58.7489,2.79,262.6082,52.3014,2.79,233.7852,-41.1668,2.8,82.0613,-20.7594,2.81,250.3217,31.6027,2.81,6.4187,-77.2542,2.82,248.9706,-28.216,2.82,276.9927,-25.4217,2.82,3.309,15.1836,2.83,121.8861,-24.3043,2.83,238.7862,-63.4307,2.83,58.533,31.8836,2.84,261.325,-55.5299,2.84,262.9604,-49.8761,2.84,56.8712,24.1051,2.85,195.5442,10.9591,2.85,326.7602,-16.1273,2.85,29.6918,-61.5699,2.86,296.2436,45.1308,2.86,95.7401,22.5136,2.87,229.7277,-68.6795,2.87,334.6256,-60.2596,2.87,44.5653,-40.3047,2.88,287.441,-21.0236,2.88,111.7877,8.2893,2.89,194.0071,38.3184,2.89,239.713,-26.1141,2.89,59.4635,40.0102,2.9,245.2971,-25.5928,2.9,322.8897,-5.5712,2.9,46.1991,53.5064,2.91,146.7755,-65.072,2.92,340.7506,30.2212,2.93,102.484,-50.6146,2.94,187.4661,-16.5154,2.94,331.446,-.3199,2.95,59.5074,-13.5085,2.97,84.4112,21.1425,2.97,146.4628,23.7743,2.97,271.452,-30.4241,2.98,199.7304,-23.1715,2.99,266.8962,-40.127,2.99,286.3525,13.8635,2.99,32.3859,34.9873,3,167.4159,44.4985,3,230.1822,71.834,3,252.9676,-38.0474,3,328.4821,-37.3649,3]; // @stars
  var stars = SN.split('|').map(function (nm, i) {
    return { name: nm, ra: SD[3 * i], dec: SD[3 * i + 1], mag: SD[3 * i + 2] };
  });

  var Astro = {
    sun: sun, sunTimes: sunTimes, dayLengthMinutes: dayLengthMinutes,
    moon: moon, moonPhase: moonPhase, moonBrightLimb: moonBrightLimb,
    stars: stars, starAltAz: starAltAz, planets: planets
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Astro;
  if (typeof window !== 'undefined') window.Astro = Astro;
})();

/* sky-band: the home band shows the real sky over New York right now.
 * The view faces south: east on the left, west on the right.
 * Sun, moon (with phase), the brightest stars and planets sit where they really are.
 * The meter on the machine reads the season: left needle = today's daylight,
 * centre needle = minutes gained or lost since yesterday (upright at the solstices,
 * leans right while the days grow). The small gauge above it shows the moon's phase.
 * A tick on the ridge marks the winter-solstice sunset; the equinox sun sets behind the tall spire.
 * Needs astro.js (above). Falls back to the plain image if anything fails.
 */
(function () {
  "use strict";
  var SCENE = {"ridgeStep":4,"ridge":[119.9,119.9,119.9,119.7,119.5,119.3,119.2,119.0,118.8,118.2,117.4,116.6,115.9,115.6,115.7,115.8,115.6,115.2,114.8,114.4,114.1,113.9,113.7,113.5,113.5,113.6,113.8,114.2,114.5,114.9,115.2,115.4,115.7,116.0,116.3,116.4,116.5,116.6,116.6,116.5,116.4,116.2,115.9,115.5,115.0,114.6,114.1,113.6,113.1,112.7,112.2,111.7,111.3,110.9,110.5,110.2,110.0,109.7,109.5,109.3,109.1,108.9,108.8,108.7,108.6,108.7,108.9,109.3,109.9,110.5,111.2,112.0,113.0,114.0,115.0,116.1,117.1,118.1,119.2,120.3,121.3,122.4,123.4,124.3,125.0,125.5,126.1,126.8,127.4,127.9,128.4,128.8,129.3,129.9,130.4,130.9,131.5,132.1,132.7,133.5,134.3,135.1,136.0,136.8,137.5,138.2,138.9,139.6,140.3,140.9,141.6,142.4,143.1,144.0,144.8,145.6,146.4,147.1,147.8,148.4,149.2,149.9,150.7,151.4,152.2,152.9,153.7,154.4,155.1,155.7,156.4,157.0,157.6,158.2,158.8,159.4,159.9,160.6,161.2,161.9,162.6,163.2,163.8,164.5,165.1,165.7,166.3,166.7,166.9,167.0,166.9,166.7,166.5,166.2,165.8,165.5,165.4,165.4,165.3,164.6,163.4,162.0,160.6,159.1,157.6,156.1,154.7,153.3,152.1,150.9,149.7,148.5,147.1,145.4,143.6,141.8,140.4,139.6,138.9,138.3,137.7,137.0,136.3,135.6,134.9,134.2,133.4,132.7,132.0,131.3,130.7,130.0,129.4,128.8,128.4,128.0,127.6,127.4,127.4,127.6,127.9,128.2,128.7,129.3,129.9,130.7,131.5,132.3,133.2,134.1,134.9,135.8,136.6,137.5,138.2,138.9,139.5,140.1,140.8,141.3,141.8,142.1,142.3,142.3,142.3,142.2,142.0,141.9,141.7,141.4,141.1,140.7,140.4,140.0,139.7,139.3,138.9,138.5,138.2,137.9,137.7,137.5,137.4,137.4,137.3,137.4,137.5,137.7,137.9,138.0,138.2,138.3,138.4,138.5,138.5,138.5,138.5,138.4,138.2,137.9,137.5,137.0,136.3,135.4,134.5,133.5,132.6,131.6,130.6,129.7,128.8,128.0,127.1,126.4,125.7,125.0,124.5,124.2,123.9,123.8,123.8,124.1,124.4,124.7,125.1,125.4,125.8,126.2,126.6,127.0,127.4,127.7,128.1,128.3,128.6,128.8,129.0,129.2,129.1,129.0,128.7,128.4,128.0,127.6,127.1,126.5,125.7,124.9,124.0,122.9,121.8,120.6,119.3,117.9,116.4,114.9,113.4,112.0,110.6,109.3,107.9,106.6,105.4,104.3,103.4,102.6,101.8,101.2,100.6,100.3,100.0,99.9,99.8,99.7,99.7,99.6,99.6,99.5,99.4,99.3,99.1,99.0,98.7,98.5,98.2,97.9,97.5,97.2,96.8,96.4,96.2,96.0,95.9,95.9,95.9,96.1,96.4,96.7,97.1,97.6,98.3,99.0,99.7,100.6,101.5,102.4,103.3,104.2,105.0,105.7,106.3,106.7,107.0,107.2,107.4,107.5,107.5,107.5,107.4,107.1,106.8,106.4,105.9,105.4,104.9,104.4,103.9,103.6,103.4,103.2,103.1,103.0,102.8,102.7,102.6,102.5,102.4,102.4,102.5,102.5],"windows":[[1436.6,173.4],[1474.2,172.5],[1455.0,174.0],[1497.6,173.4],[1509.1,173.1],[1516.0,172.5],[1529.1,173.4],[1547.5,173.3],[1552.5,173.5],[1342.1,193.7],[1346.9,192.9],[1352.1,193.1],[1358.0,193.5],[1367.3,192.9],[1378.9,192.9],[1392.3,193.0],[1402.7,193.0],[1413.3,193.1],[1420.0,193.3]],"beacons":[[1381,9],[1484,32]],"tubes":[[866,352],[889,350],[918,352],[936,350],[952,360]],"dial":{"c":[797.9,329.1],"r":21,"pivots":[[787,347.5],[809,347.5]],"len":35},"moonGauge":{"c":[837,283.3],"r":7.8}};
  var W = 1600, H = 475;
  // azimuth at the left and right edges: the equinox sun goes down behind the tall spire
  var AZ0 = 50, AZ1 = 302.9;
  var LAT = 40.7128, LON = -74.006;
  var SUN_R = 24, MOON_R = 22;
  var SET = -0.833;                    // sun centre altitude at official sunrise/sunset
  // altitude -> height above the "just set" line; high objects ease against the top edge
  var LIFT = 30, TAU = 5, K = 1.21, Q = 1.0;
  var TOP = SUN_R + 3, TOP_S = 16;
  var CAM_F = 900, CAM_CX = 800, CAM_YH = 185;   // the camera that "took" the painting
  var INK = "rgb(19,65,44)";
  var D2R = Math.PI / 180;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mk() { var c = document.createElement("canvas"); c.width = W; c.height = H; return c; }
  function ctxOf(c) { var x = c.getContext("2d"); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over"; x.clearRect(0, 0, W, H); return x; }

  // all pixel reads go through one CPU-side scratch canvas; the drawing canvases stay on the GPU
  var scratch;
  function readback(src) {
    if (!scratch) scratch = mk();
    var x = scratch.getContext("2d", { willReadFrequently: true });
    x.clearRect(0, 0, W, H); x.drawImage(src, 0, 0);
    return x.getImageData(0, 0, W, H);
  }
  function canvasOf(id) { var c = mk(); c.getContext("2d").putImageData(id, 0, 0); return c; }
  // one channel of the packed mask image -> a canvas whose alpha is that channel
  function alphaOf(src, ch) {
    var id = readback(src), d = id.data;
    for (var i = 0; i < d.length; i += 4) { var a = d[i + ch]; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = a; }
    return canvasOf(id);
  }

  function SkyBand(canvas, overlay, img, scene) {
    this.canvas = canvas; canvas.width = W; canvas.height = H;
    this.ctx = canvas.getContext("2d");
    this.plate = img.plate; this.scene = scene;
    this.sky = alphaOf(img.masks, 0); this.water = alphaOf(img.masks, 1); this.sil = alphaOf(img.masks, 2);
    this.t1 = mk(); this.t2 = mk();
    // the art's cloud streaks, tinted onto the plate's green, cross the sun and moon
    var id = readback(img.cloud), dd = id.data;
    for (var i = 0; i < dd.length; i += 4) {
      if (!dd[i + 3]) { dd[i] = dd[i + 1] = dd[i + 2] = dd[i + 3] = 255; continue; }   // below the cloud rows: no effect
      var f = Math.min(1, (255 - dd[i]) / 65); dd[i] = 255 - f * 100; dd[i + 1] = 255 - f * 72; dd[i + 2] = 255 - f * 92;
    }
    this.cloud = canvasOf(id);
    // spire beacons live on their own canvas; CSS blinks it, so night needs no redraws
    this.ov = overlay; overlay.width = W; overlay.height = H; this.ovLevel = -1;
    var r = scene.ridge, s = 0; for (var j = 0; j < r.length; j++) s += r[j];
    this.ridgeMean = s / r.length;
  }

  SkyBand.prototype.ridgeAt = function (x) {
    var r = this.scene.ridge, i = clamp(x / this.scene.ridgeStep, 0, r.length - 1);
    var i0 = Math.floor(i), i1 = Math.min(r.length - 1, i0 + 1);
    return lerp(r[i0], r[i1], i - i0);
  };

  // alt/az (deg) -> band pixels. One mapping for everything, so conjunctions line up.
  SkyBand.prototype.place = function (alt, az) {
    var x = (az - AZ0) / (AZ1 - AZ0) * W;
    var u = alt - SET;
    var base = lerp(this.ridgeAt(x), this.ridgeMean, smooth(2, 16, u)) + SUN_R;
    var d = u > 0 ? LIFT * (1 - Math.exp(-u / TAU)) + K * Math.pow(u, Q) : u * (LIFT / TAU);
    var y = base - d;
    if (y < TOP + TOP_S) y = TOP + TOP_S * Math.exp((y - TOP - TOP_S) / TOP_S);
    return { x: x, y: y };
  };

  // keep only what shows through the sky (behind mountains, trees, domes)
  SkyBand.prototype.skyOnly = function (c) {
    var x = c.getContext("2d"); x.globalAlpha = 1; x.globalCompositeOperation = "destination-in"; x.drawImage(this.sky, 0, 0); x.globalCompositeOperation = "source-over";
  };
  SkyBand.prototype.composite = function (c, op, alpha) {
    var m = this.ctx; m.save(); m.globalCompositeOperation = op; m.globalAlpha = alpha; m.drawImage(c, 0, 0); m.restore();
  };

  // darken land and sky in one multiply, on the plate's green, fading in from white (no step at dusk)
  SkyBand.prototype.tint = function (kLand, kSky) {
    function col(k) { var w = Math.min(1, (1 - k) * 4); return "rgb(" + Math.round(k * (255 - 29 * w)) + "," + Math.round(k * 255) + "," + Math.round(k * (255 - 17 * w)) + ")"; }
    var t = ctxOf(this.t1); t.fillStyle = col(kLand); t.fillRect(0, 0, W, H);
    var t2 = ctxOf(this.t2); t2.fillStyle = col(kSky); t2.fillRect(0, 0, W, H); this.skyOnly(this.t2);
    t.drawImage(this.t2, 0, 0);
    this.composite(this.t1, "multiply", 1);
  };

  SkyBand.prototype.glow = function (x, y, r0, r1, a, sy) {
    var t = ctxOf(this.t2);
    t.translate(x, y); t.scale(1, sy || 1);
    var g = t.createRadialGradient(0, 0, r0, 0, 0, r1);
    g.addColorStop(0, "rgba(250,248,236," + a + ")"); g.addColorStop(0.35, "rgba(250,248,236," + a * 0.35 + ")"); g.addColorStop(1, "rgba(250,248,236,0)");
    t.fillStyle = g; t.beginPath(); t.arc(0, 0, r1, 0, Math.PI * 2); t.fill();
    t.setTransform(1, 0, 0, 1, 0, 0);
    this.skyOnly(this.t2);
    this.composite(this.t2, "screen", 1);
  };

  // disc body (sun or moon) with the art's cloud streaks passing in front
  SkyBand.prototype.disc = function (drawShape, alpha, op) {
    var t = ctxOf(this.t1);
    t.fillStyle = "rgb(247,245,236)"; drawShape(t); t.fill();
    t.globalCompositeOperation = "multiply"; t.drawImage(this.cloud, 0, 0);
    t.globalCompositeOperation = "destination-in"; drawShape(t); t.fill();
    this.skyOnly(this.t1);
    this.composite(this.t1, op || "source-over", alpha);
  };

  // sun or moon glitter on the river, straight below it
  SkyBand.prototype.glint = function (x, a) {
    if (a < 0.01 || x < -160 || x > W + 160) return;
    var t = ctxOf(this.t2), g = t.createLinearGradient(x - 150, 0, x + 150, 0);
    g.addColorStop(0, "rgba(255,253,240,0)"); g.addColorStop(0.38, "rgba(255,253,240," + a * 0.35 + ")");
    g.addColorStop(0.5, "rgba(255,253,240," + a + ")"); g.addColorStop(0.62, "rgba(255,253,240," + a * 0.35 + ")"); g.addColorStop(1, "rgba(255,253,240,0)");
    t.fillStyle = g; t.fillRect(x - 150, 195, 300, 115);
    t.globalCompositeOperation = "destination-in"; t.drawImage(this.water, 0, 0);
    this.composite(this.t2, "screen", 1);
  };

  // the machine's shadow on the table: its outline projected onto the tabletop
  // away from the sun, longer the lower the sun (a sundial)
  SkyBand.prototype.tableShadow = function (sx, alt, a) {
    if (a < 0.01) return;
    var dx = (sx - CAM_CX) / CAM_F, n = Math.sqrt(dx * dx + 1), ta = Math.tan(Math.max(alt, 1.5) * D2R);
    var yb = 449, p = dx / (n * ta), q = (yb - CAM_YH) / CAM_F / (n * ta);
    var t = ctxOf(this.t1);
    t.save(); t.beginPath(); t.rect(452, 445, 742, 30); t.clip();
    t.setTransform(1, 0, p, -q, -p * yb, yb * (1 + q)); t.drawImage(this.sil, 0, 0);
    t.restore();
    t.globalCompositeOperation = "source-in"; t.fillStyle = "rgb(178,196,186)"; t.fillRect(0, 0, W, H);
    t.globalCompositeOperation = "destination-out"; t.drawImage(this.sil, 0, 0);
    this.composite(this.t1, "multiply", a);
  };

  // where the sun goes down on the winter solstice, standing on the real skyline
  SkyBand.prototype.solstice = function (date) {
    var A = window.Astro, y = date.getUTCFullYear();
    if (this._solY !== y) {
      var set = A.sunTimes(new Date(Date.UTC(y, 11, 21, 17)), LAT, LON).sunset;
      this._solX = Math.round((A.sun(set, LAT, LON).az - AZ0) / (AZ1 - AZ0) * W); this._solY = y;
      var d = readback(this.sky).data, x = clamp(this._solX, 0, W - 1); this._solRidge = H;
      for (var r = 0; r < H; r++) if (d[(r * W + x) * 4 + 3] < 128) { this._solRidge = r; break; }
    }
    return [this._solX, this._solRidge];
  };

  SkyBand.prototype.render = function (date, o) {
    o = o || {};
    var A = window.Astro, m = this.ctx, sc = this.scene;
    var sun = A.sun(date, LAT, LON), s = sun.alt;
    var moon = A.moon(date, LAT, LON), ph = A.moonPhase(date), f = ph.fraction;
    var moonUp = smooth(-2, 1, moon.alt) * f;
    var dim = o.dim || 1;               // dark theme dims land and sky, not the sun or the lights

    m.setTransform(1, 0, 0, 1, 0, 0); m.globalAlpha = 1; m.globalCompositeOperation = "source-over";
    m.clearRect(0, 0, W, H);
    m.drawImage(this.plate, 0, 0, W, H);
    var sp = this.place(s, sun.az), sunUp = smooth(-0.6, 2.5, s);
    this.tableShadow(sp.x, s, 0.9 * sunUp);

    // the meter reads the season, needles clipped to its glass
    var len = A.dayLengthMinutes(date, LAT, LON), prev = A.dayLengthMinutes(new Date(date.getTime() - 864e5), LAT, LON);
    var dc = sc.dial;
    m.save(); m.beginPath(); m.arc(dc.c[0], dc.c[1], dc.r - 1, 0, Math.PI * 2); m.clip();
    this.needle(dc.pivots[0], lerp(6, 52, clamp((len - 555) / (906 - 555), 0, 1)), dc.len);
    this.needle([798, 348], 26 * clamp((len - prev) / 2.75, -1, 1), 30);
    m.restore();
    this.moonGauge(sc.moonGauge, ph);
    // the solstice tick: sunsets drift right of it from late December on
    var sol = this.solstice(date);
    m.fillStyle = INK; m.fillRect(sol[0] - 1, sol[1] - 7, 2, 8);

    // how much daylight reaches the scene
    var day = smooth(-11, 3, s);
    var nightDepth = o.nightDepth == null ? 0.5 : o.nightDepth;
    var landK = (lerp(1 - nightDepth * 1.05, 1, day) + 0.07 * moonUp * (1 - day)) * dim;
    var skyK = lerp(1 - nightDepth, 1, smooth(-13, 1, s)) * dim;
    if (landK < 0.9995 || skyK < 0.9995) this.tint(Math.min(1, landK), Math.min(1, skyK));

    // twilight glow on the horizon where the sun went down (or will come up)
    if (s > -15 && s < 10) {
      var g = Math.exp(-Math.pow((s + 1.5) / 5.5, 2));
      if (g > 0.01) this.glow(sp.x, this.ridgeAt(clamp(sp.x, 0, W)) + 10, 0, 520, 0.42 * g, 0.42);
    }
    // the city's light dome: the sky never gets truly dark over New York
    if (day < 1) {
      var t = ctxOf(this.t2), lg = t.createLinearGradient(0, 40, 0, 170);
      lg.addColorStop(0, "rgba(240,242,226,0)"); lg.addColorStop(1, "rgba(240,242,226," + 0.1 * (1 - day) + ")");
      t.fillStyle = lg; t.fillRect(0, 0, W, H); this.skyOnly(this.t2); this.composite(this.t2, "screen", 1);
    }

    // glitter on the river under the sun, or under the moon at night
    this.glint(sp.x, 0.5 * sunUp * (1 - smooth(12, 40, s)));
    var mp = this.place(moon.alt, moon.az);
    this.glint(mp.x, 0.3 * f * (1 - day) * smooth(-1, 3, moon.alt) * (1 - smooth(25, 50, moon.alt)));

    // stars and planets as hard specks, like flecks in the plate. Manhattan shows about a dozen.
    var dark = 1 - smooth(-12, -5, s);
    if (dark > 0.01) {
      var t3 = ctxOf(this.t1), n = 0;
      t3.fillStyle = "rgb(246,244,232)";
      if (!this.starsByMag) this.starsByMag = A.stars.slice().sort(function (a, b) { return a.mag - b.mag; });
      for (var i = 0; i < this.starsByMag.length && n < 12; i++) {
        var st = this.starsByMag[i]; if (st.mag > 2.6) break;
        var h = A.starAltAz(st.ra, st.dec, date, LAT, LON); if (h.alt < 1) continue;
        var p = this.place(h.alt, h.az); if (p.x < -4 || p.x > W + 4 || p.y < -4) continue;
        n++;
        var sz = st.mag < 0.5 ? 3 : 2;
        t3.globalAlpha = dark * smooth(1, 12, h.alt) * clamp(1.15 - 0.32 * st.mag, 0.3, 1);
        t3.fillRect(Math.round(p.x - sz / 2), Math.round(p.y - sz / 2), sz, sz);
      }
      var pl = A.planets(date, LAT, LON), pdark = 1 - smooth(-7, -2, s);
      for (var j = 0; j < pl.length; j++) {
        var pq = pl[j]; if (pq.alt < 1 || pq.mag > 1.6) continue;
        var pp = this.place(pq.alt, pq.az); if (pp.x < -4 || pp.x > W + 4 || pp.y < -4) continue;
        var ps = pq.mag < -2 ? 4 : 3;
        t3.globalAlpha = pdark * smooth(1, 8, pq.alt) * clamp(0.9 - 0.15 * pq.mag, 0.5, 1);
        t3.fillRect(Math.round(pp.x - ps / 2), Math.round(pp.y - ps / 2), ps, ps);
      }
      t3.globalAlpha = 1;
      this.skyOnly(this.t1); this.composite(this.t1, "source-over", 1);
    }

    // moon, lit side facing the real sun; a thin crescent in daylight is left out
    if (moon.alt > -3 && mp.x > -MOON_R * 3 && mp.x < W + MOON_R * 3) {
      var limb = A.moonBrightLimb(date, LAT, LON), ang = Math.atan2(-limb.dy, limb.dx);
      var vis = lerp(1, 0.42, smooth(-4, 8, s)) * lerp(1, smooth(0.15, 0.4, f), day);
      var R = MOON_R, op = day > 0.5 ? "lighten" : "source-over";   // never darker than a daytime sky
      this.disc(function (c) { c.beginPath(); c.arc(mp.x, mp.y, R, 0, Math.PI * 2); }, 0.09 * vis * (1 - day), op);   // earthshine
      this.disc(function (c) {
        c.save(); c.translate(mp.x, mp.y); c.rotate(ang); c.beginPath();
        c.arc(0, 0, R, -Math.PI / 2, Math.PI / 2, false);
        c.ellipse(0, 0, Math.max(0.01, R * Math.abs(1 - 2 * f)), R, 0, Math.PI / 2, -Math.PI / 2, f < 0.5);
        c.closePath(); c.restore();
      }, vis, op);
      if (day < 0.6) this.glow(mp.x, mp.y, R * 0.8, R * 4, 0.16 * f * vis * (1 - day), 1);
    }

    // sun
    if (s > -3) {
      var low = smooth(0, 8, s);
      this.disc(function (c) { c.beginPath(); c.arc(sp.x, sp.y, SUN_R, 0, Math.PI * 2); }, lerp(0.9, 0.98, low));
      this.glow(sp.x, sp.y, SUN_R * 0.85, SUN_R * lerp(5.5, 3.6, low), lerp(0.5, 0.32, low), 1);
    }

    // the machines and the city at night: lit windows are hard squares, glass glows soft
    var lights = 1 - smooth(-7, -1, s);
    if (lights > 0.01) {
      var t4 = ctxOf(this.t2), k, w, gg;
      t4.fillStyle = "rgba(255,250,226,0.95)";
      for (k = 0; k < sc.windows.length; k++) { w = sc.windows[k]; t4.fillRect(Math.round(w[0]) - 1, Math.round(w[1]) - 1, 3, 3); }
      for (k = 0; k < sc.tubes.length; k++) {
        w = sc.tubes[k];
        gg = t4.createRadialGradient(w[0], w[1], 0, w[0], w[1], 9);
        gg.addColorStop(0, "rgba(255,246,214,0.7)"); gg.addColorStop(0.3, "rgba(255,246,214,0.28)"); gg.addColorStop(1, "rgba(255,246,214,0)");
        t4.fillStyle = gg; t4.fillRect(w[0] - 9, w[1] - 9, 18, 18);
      }
      var mg = sc.moonGauge.c, mr = sc.moonGauge.r + 3;
      gg = t4.createRadialGradient(mg[0], mg[1], 0, mg[0], mg[1], mr);
      gg.addColorStop(0, "rgba(255,248,222,0.3)"); gg.addColorStop(1, "rgba(255,248,222,0)");
      t4.fillStyle = gg; t4.fillRect(mg[0] - mr, mg[1] - mr, mr * 2, mr * 2);
      var dl = dc.c;
      gg = t4.createRadialGradient(dl[0], dl[1] + 4, 0, dl[0], dl[1] + 4, dc.r + 4);
      gg.addColorStop(0, "rgba(255,248,222,0.32)"); gg.addColorStop(0.7, "rgba(255,248,222,0.18)"); gg.addColorStop(1, "rgba(255,248,222,0)");
      t4.fillStyle = gg; t4.fillRect(dl[0] - 30, dl[1] - 30, 60, 64);
      this.composite(this.t2, "screen", lights);
    }
    // beacons: redraw the overlay only when the light level moves a step
    var lv = Math.round(lights * 20) / 20;
    if (lv !== this.ovLevel) {
      this.ovLevel = lv;
      var bo = ctxOf(this.ov);
      for (var b = 0; lv > 0 && b < sc.beacons.length; b++) {
        bo.fillStyle = "rgba(255,250,230," + lv * (b ? 0.8 : 1) + ")";
        bo.fillRect(Math.round(sc.beacons[b][0]) - 1, Math.round(sc.beacons[b][1]) - 1, 3, 3);
      }
    }
  };

  // moon-phase gauge: lit on the right while waxing, on the left while waning, as seen from New York
  SkyBand.prototype.moonGauge = function (g, ph) {
    var m = this.ctx, R = g.r, f = ph.fraction;
    m.save(); m.translate(g.c[0], g.c[1]);
    m.fillStyle = "rgb(44,66,56)"; m.beginPath(); m.arc(0, 0, R + 1, 0, Math.PI * 2); m.fill();
    if (!ph.waxing) m.rotate(Math.PI);
    var lg = m.createRadialGradient(R * 0.15, -R * 0.2, 0, 0, 0, R);
    lg.addColorStop(0, "rgb(240,242,228)"); lg.addColorStop(1, "rgb(204,213,197)");
    m.fillStyle = lg; m.beginPath();
    m.arc(0, 0, R, -Math.PI / 2, Math.PI / 2, false);
    m.ellipse(0, 0, Math.max(0.01, R * Math.abs(1 - 2 * f)), R, 0, Math.PI / 2, -Math.PI / 2, f < 0.5);
    m.closePath(); m.fill();
    m.strokeStyle = "rgba(22,42,34,0.6)"; m.lineWidth = 0.9;
    m.beginPath(); m.arc(0, 0, R + 0.5, 0, Math.PI * 2); m.stroke();
    m.restore();
  };

  // one meter needle; angle in degrees from upright, positive leans right
  SkyBand.prototype.needle = function (p, deg, len) {
    var m = this.ctx, a = deg * D2R, x2 = p[0] + Math.sin(a) * len, y2 = p[1] - Math.cos(a) * len;
    m.save(); m.lineCap = "round";
    m.strokeStyle = "rgba(20,40,32,0.25)"; m.lineWidth = 2.2;
    m.beginPath(); m.moveTo(p[0] + 0.8, p[1] + 0.6); m.lineTo(x2 + 0.8, y2 + 0.6); m.stroke();
    m.strokeStyle = "rgb(34,52,44)"; m.lineWidth = 1.1;
    m.beginPath(); m.moveTo(p[0], p[1]); m.lineTo(x2, y2); m.stroke();
    m.fillStyle = "rgb(34,52,44)"; m.beginPath(); m.arc(p[0], p[1], 1.6, 0, Math.PI * 2); m.fill();
    m.restore();
  };

  // boot: swap the band image for the live canvas once everything has loaded
  var img = document.querySelector("img[data-sky]");
  if (!img || !window.Astro) return;
  var dir = img.getAttribute("src").replace(/[^/]*$/, "");
  function load(src) { return new Promise(function (ok, bad) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = bad; i.src = src; }); }
  var plate = img.complete && img.naturalWidth ? Promise.resolve(img) : new Promise(function (ok, bad) { img.addEventListener("load", function () { ok(img); }); img.addEventListener("error", bad); });
  Promise.all([plate, load(dir + "masks.webp"), load(dir + "cloud.webp")]).then(function (v) {
    var root = document.documentElement, system = matchMedia("(prefers-color-scheme: dark)");
    var wrap = document.createElement("div"), cv = document.createElement("canvas"), ov = document.createElement("canvas");
    wrap.className = "sky"; ov.className = "sky-ov";
    cv.setAttribute("aria-hidden", "true"); ov.setAttribute("aria-hidden", "true");
    wrap.appendChild(cv); wrap.appendChild(ov);
    var band = new SkyBand(cv, ov, { plate: v[0], masks: v[1], cloud: v[2] }, SCENE);
    function draw() {
      var dark = root.dataset.theme ? root.dataset.theme === "dark" : system.matches;
      band.render(new Date(), { dim: dark ? 0.7 : 1, nightDepth: dark ? 0.36 : 0.5 });
    }
    draw();
    img.replaceWith(wrap);
    setInterval(function () { if (!document.hidden) draw(); }, 60000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) draw(); });
    new MutationObserver(draw).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    if (system.addEventListener) system.addEventListener("change", draw);
  }).catch(function () { /* keep the plain image */ });
})();
