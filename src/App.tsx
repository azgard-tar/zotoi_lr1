import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Divider,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  type SelectChangeEvent,
} from "@mui/material";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import type { ChartDataset } from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

type TriangularNumber = { left: number; middle: number; right: number };
type LinguisticTerm = {
  name: string;
  shortName: string;
  tri: TriangularNumber;
};
type CellValue = { from?: string; to?: string };
type CalculationMethod = "generalized" | "pessimistic" | "optimistic";
type Trapeze = { a: number; b: number; c: number; d: number }; // Трапеційний терм (a, b, c, d) [4]
type Interval = { l: number; r: number }; // Інтервал α-перерізу [l, r] [5]

// New type to hold calculation results for display in the main table
type DisplayResult = {
  // generalized
  genInterval?: Interval;
  genProbability?: number;
  // pessimistic
  pessInterval?: Interval;
  pessProbability?: number;
  // optimistic
  optInterval?: Interval;
  optProbability?: number;
};

function App() {
  const [numAlternatives, setNumAlternatives] = useState<number>(3);
  const [numCriterias, setNumCriterias] = useState<number>(3);
  const [numLinguisticTerms, setNumLinguisticTerms] = useState<number>(5);
  const [alpha, setAlpha] = useState<number>(0.5);

  const [currentTermIndex, setCurrentTermIndex] = useState<number>(0);
  const [terms, setTerms] = useState<LinguisticTerm[]>([]);
  const [currentPage, setCurrentPage] = useState<"setup" | "evaluation">(
    "setup"
  );
  const [tableData, setTableData] = useState<CellValue[][]>([]);
  const [editingCell, setEditingCell] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const [modalFrom, setModalFrom] = useState<string>("");
  const [modalTo, setModalTo] = useState<string>("");
  const [isTransformedToIntervals, setIsTransformedToIntervals] =
    useState(false);
  const [isTransformedToTrapeze, setIsTransformedToTrapeze] = useState(false);
  const [calculationMethod, setCalculationMethod] =
    useState<CalculationMethod>("generalized");

  const [internalIntervalLTSets, setInternalIntervalLTSets] = useState<
    string[][][]
  >([]); // Крок 2
  const [internalTrapezeMatrix, setInternalTrapezeMatrix] = useState<
    Trapeze[][]
  >([]); // Крок 3

  // New state for integrated results
  const [displayResults, setDisplayResults] = useState<DisplayResult[]>([]);
  const [bestProbability, setBestProbability] = useState<number | null>(null);

  const resetAll = () => {
    setNumAlternatives(3);
    setNumCriterias(3);
    setNumLinguisticTerms(5);
    setAlpha(0.5);
    setCurrentTermIndex(0);
    setTerms([]);
    setCurrentPage("setup");
    setTableData([]);
    setIsTransformedToIntervals(false);
    setIsTransformedToTrapeze(false);
    setInternalIntervalLTSets([]);
    setInternalTrapezeMatrix([]);
    setDisplayResults([]);
    setBestProbability(null);
  };

  const handleCalculationMethodChange = (
    e: SelectChangeEvent<CalculationMethod>
  ) => {
    setCalculationMethod(e.target.value as CalculationMethod);
    // Reset results when method changes
    setDisplayResults([]);
    setBestProbability(null);
  };

  const orderTriangular = (t: TriangularNumber): TriangularNumber => {
    const left = Math.min(t.left, t.middle, t.right);
    const right = Math.max(t.left, t.middle, t.right);
    const sum = t.left + t.middle + t.right;
    const middle = Math.max(left, Math.min(right, sum - left - right));
    return { left, middle, right };
  };

  const getTrapezeFromLTSets = (
    ltShortNames: string[],
    allTerms: LinguisticTerm[]
  ): Trapeze | null => {
    if (ltShortNames.length === 0) return null;

    const triangularTerms = ltShortNames
      .map((shortName) => allTerms.find((t) => t.shortName === shortName)?.tri)
      .filter((tri): tri is TriangularNumber => !!tri);

    if (triangularTerms.length === 0) return null;

    const orderedTerms = triangularTerms.map((t) => orderTriangular(t));

    const lefts = orderedTerms.map((t) => t.left);
    const middles = orderedTerms.map((t) => t.middle);
    const rights = orderedTerms.map((t) => t.right);

    const a = Math.min(...lefts);
    const b = Math.min(...middles);
    const c = Math.max(...middles);
    const d = Math.max(...rights);

    return { a, b, c, d };
  };

  useEffect(() => {
    setCurrentTermIndex((i) =>
      Math.min(Math.max(0, i), Math.max(0, terms.length - 1))
    );
  }, [terms.length]);

  const currentTerm = useMemo(
    () =>
      terms[currentTermIndex] ?? {
        name: "",
        shortName: "",
        tri: { left: Number.NaN, middle: Number.NaN, right: Number.NaN },
      },
    [terms, currentTermIndex]
  );

  const handlePrev = () => {
    if (terms.length === 0) {
      if (numLinguisticTerms > 0)
        setTerms([
          {
            name: "",
            shortName: "",
            tri: { left: -0.5, middle: 0, right: 0.5 },
          },
        ]);
      return;
    }
    const n = terms.length;
    setCurrentTermIndex((i) => (i - 1 + n) % n);
  };
  const handleNext = () => {
    if (terms.length === 0) {
      if (numLinguisticTerms > 0)
        setTerms([
          {
            name: "",
            shortName: "",
            tri: { left: -0.5, middle: 0, right: 0.5 },
          },
        ]);
      return;
    }
    if (
      currentTermIndex === terms.length - 1 &&
      terms.length < numLinguisticTerms
    ) {
      setTerms((prev) => [
        ...prev,
        { name: "", shortName: "", tri: { left: -0.5, middle: 0, right: 0.5 } },
      ]);
      setCurrentTermIndex((i) => i + 1);
      return;
    }
    const n = terms.length;
    setCurrentTermIndex((i) => (i + 1) % n);
  };

  const upsertCurrentTerm = (partial?: Partial<LinguisticTerm>) => {
    setTerms((prev) => {
      if (prev.length === 0 && numLinguisticTerms > 0) {
        return [
          {
            name: "",
            shortName: "",
            tri: { left: -0.5, middle: 0, right: 0.5 },
            ...(partial || {}),
          },
        ];
      }
      if (currentTermIndex >= prev.length && prev.length < numLinguisticTerms) {
        return [
          ...prev,
          {
            name: "",
            shortName: "",
            tri: { left: -0.5, middle: 0, right: 0.5 },
            ...(partial || {}),
          },
        ];
      }
      return prev.map((t, idx) =>
        idx === currentTermIndex ? { ...t, ...(partial || {}) } : t
      );
    });
  };

  const normalizeCurrentTerm = () => {
    const { left, middle, right } = currentTerm.tri;
    const normalized = orderTriangular({
      left: left / 100,
      middle: middle / 100,
      right: right / 100,
    });
    upsertCurrentTerm({ tri: normalized });
  };

  const handleFinish = () => {
    const newTableData = Array.from({ length: numAlternatives }, () =>
      Array.from({ length: numCriterias }, () => ({
        from: undefined,
        to: undefined,
      }))
    );
    setTableData(newTableData);
    setCurrentPage("evaluation");
  };

  const getCellText = (cell: CellValue) => {
    const { from, to } = cell;
    if (from && to) {
      if (from === to) {
        const term = terms.find((t) => t.shortName === from);
        return term?.shortName || "";
      } else {
        return `within ${from} and ${to}`;
      }
    } else if (from && !to) {
      return `over ${from}`;
    } else if (!from && to) {
      return `less ${to}`;
    }
    return "";
  };

  const handleCellClick = (row: number, col: number) => {
    if (isTransformedToTrapeze) return;
    const cell = tableData[row][col];
    setModalFrom(cell.from || "");
    setModalTo(cell.to || "");
    setEditingCell({ row, col });
  };

  const handleModalSave = () => {
    if (!editingCell) return;
    const newTableData = [...tableData];
    newTableData[editingCell.row][editingCell.col] = {
      from: modalFrom || undefined,
      to: modalTo || undefined,
    };
    setTableData(newTableData);
    setEditingCell(null);
  };

  const isAllCellsFilled = () => {
    return tableData.every((row) => row.every((cell) => cell.from || cell.to));
  };

  const handleTransformToIntervals = () => {
    if (!isAllCellsFilled() || terms.length === 0) {
      console.warn(
        "Cannot transform: Not all cells are filled or linguistic terms are missing."
      );
      return;
    }
    const termShortNames = terms.map((t) => t.shortName);

    const intervalLTSets: string[][][] = tableData.map((row: CellValue[]) =>
      row.map((cell: CellValue) => {
        const { from, to } = cell;
        if (!from && !to) return [];
        if (from && from === to) return [from];
        if (from && to) {
          const startIndex = termShortNames.indexOf(from);
          const endIndex = termShortNames.indexOf(to);
          if (startIndex !== -1 && endIndex !== -1) {
            const minIndex = Math.min(startIndex, endIndex);
            const maxIndex = Math.max(startIndex, endIndex);
            return termShortNames.slice(minIndex, maxIndex + 1);
          }
        }
        if (from && !to) {
          const startIndex = termShortNames.indexOf(from);
          if (startIndex !== -1) return termShortNames.slice(startIndex);
        }
        if (!from && to) {
          const endIndex = termShortNames.indexOf(to);
          if (endIndex !== -1) return termShortNames.slice(0, endIndex + 1);
        }
        return [];
      })
    );

    setInternalIntervalLTSets(intervalLTSets);
    setIsTransformedToIntervals(true);
    // Reset subsequent steps
    setIsTransformedToTrapeze(false);
    setDisplayResults([]);
    setBestProbability(null);
  };

  const handleTransformToTrapeze = () => {
    if (!isTransformedToIntervals || internalIntervalLTSets.length === 0) {
      console.error("Must transform to intervals first.");
      return;
    }

    const trapezeMatrix: Trapeze[][] = internalIntervalLTSets.map(
      (row: string[][]) =>
        row.map((cellLTSets) => {
          const trapeze = getTrapezeFromLTSets(cellLTSets, terms);
          return trapeze || { a: 0, b: 0, c: 0, d: 0 };
        })
    );

    setInternalTrapezeMatrix(trapezeMatrix);
    setIsTransformedToTrapeze(true);
    // Reset calculation results
    setDisplayResults([]);
    setBestProbability(null);
  };

  const getIntervalFromTrapeze = (
    trapeze: Trapeze,
    alpha: number
  ): Interval => {
    const { a, b, c, d } = trapeze;
    const l = alpha * b + (1 - alpha) * a;
    const r = alpha * c + (1 - alpha) * d;
    return { l: l, r: r };
  };

  const calculateProbability = (interval: Interval): number => {
    const { l, r } = interval;
    if (l >= 0) return 1.0;
    if (r <= 0) return 0.0;
    if (r > l) return r / (r - l);
    return 0;
  };

  const handleCalculateMethod = () => {
    if (!isTransformedToTrapeze || internalTrapezeMatrix.length === 0) {
      console.error("Trapeze matrix is not ready. Run transformation first.");
      return;
    }

    const results: DisplayResult[] = Array.from({ length: numAlternatives }, () => ({}));
    let maxProbability = -1;

    const intervalMatrix: Interval[][] = internalTrapezeMatrix.map((row) =>
      row.map((trapeze) => getIntervalFromTrapeze(trapeze, alpha))
    );

    for (let i = 0; i < numAlternatives; i++) {
      const intervalsForAlternative = intervalMatrix[i];
      if (numCriterias === 0 || intervalsForAlternative.length === 0) continue;

      if (calculationMethod === "generalized") {
        const sumTrapeze = internalTrapezeMatrix[i].reduce(
          (acc, T_ij) => ({
            a: acc.a + T_ij.a,
            b: acc.b + T_ij.b,
            c: acc.c + T_ij.c,
            d: acc.d + T_ij.d,
          }),
          { a: 0, b: 0, c: 0, d: 0 }
        );

        const T_i_avg: Trapeze = {
          a: sumTrapeze.a / numCriterias,
          b: sumTrapeze.b / numCriterias,
          c: sumTrapeze.c / numCriterias,
          d: sumTrapeze.d / numCriterias,
        };

        const finalInterval = getIntervalFromTrapeze(T_i_avg, alpha);
        const probability = calculateProbability(finalInterval);

        results[i] = { ...results[i], genInterval: finalInterval, genProbability: probability };
        if (probability > maxProbability) maxProbability = probability;

      } else if (calculationMethod === "pessimistic") {
        const min_l = Math.min(...intervalsForAlternative.map(inv => inv.l));
        const min_r = Math.min(...intervalsForAlternative.map(inv => inv.r));
        const finalInterval = { l: min_l, r: min_r };
        const probability = calculateProbability(finalInterval);

        results[i] = { ...results[i], pessInterval: finalInterval, pessProbability: probability };
        if (probability > maxProbability) maxProbability = probability;

      } else if (calculationMethod === "optimistic") {
        const max_l = Math.max(...intervalsForAlternative.map(inv => inv.l));
        const max_r = Math.max(...intervalsForAlternative.map(inv => inv.r));
        const finalInterval = { l: max_l, r: max_r };
        const probability = calculateProbability(finalInterval);

        results[i] = { ...results[i], optInterval: finalInterval, optProbability: probability };
        if (probability > maxProbability) maxProbability = probability;
      }
    }

    setDisplayResults(results);
    setBestProbability(maxProbability);
  };

  const isTriComplete = (tri: TriangularNumber) =>
    Number.isFinite(tri.left) &&
    Number.isFinite(tri.middle) &&
    Number.isFinite(tri.right);
  const nameError = useMemo(() => {
    const t = terms[currentTermIndex];
    if (!t) return "";
    if (!t.name || t.name.trim().length < 3)
      return "Name must be at least 3 characters";
    const dup = terms.some(
      (x, i) => i !== currentTermIndex && x.name.trim() === t.name.trim()
    );
    return dup ? "Name must be unique" : "";
  }, [terms, currentTermIndex]);
  const shortNameError = useMemo(() => {
    const t = terms[currentTermIndex];
    if (!t) return "";
    if (!t.shortName || t.shortName.trim().length === 0)
      return "Short name is required";
    const dup = terms.some(
      (x, i) =>
        i !== currentTermIndex && x.shortName.trim() === t.shortName.trim()
    );
    return dup ? "Short name must be unique" : "";
  }, [terms, currentTermIndex]);
  const triError = useMemo(() => {
    const t = terms[currentTermIndex];
    if (!t) return "";
    if (!isTriComplete(t.tri)) return "Fill all fields";
    const { left, middle, right } = t.tri;
    if (left === middle && middle === right)
      return "Require left < middle or  middle < right";
    return "";
  }, [terms, currentTermIndex]);
  const hasAnyError = useMemo(() => {
    if (terms.length === 0) return true;
    const names = new Set<string>();
    const shorts = new Set<string>();
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i];
      const n = t.name?.trim() || "";
      const s = t.shortName?.trim() || "";
      if (n.length < 3) return true;
      if (s.length === 0) return true;
      if (names.has(n) || shorts.has(s)) return true;
      names.add(n);
      shorts.add(s);
      if (!isTriComplete(t.tri)) return true;
      const { left, middle, right } = t.tri;
      if (left === middle && middle === right) return true;
    }
    return false;
  }, [terms]);

  const chartData = useMemo(() => {
    const completedTerms = terms.filter((t) => isTriComplete(t.tri));
    const minLeft = completedTerms.length
      ? Math.min(...completedTerms.map((t) => orderTriangular(t.tri).left))
      : 0;
    const maxRight = completedTerms.length
      ? Math.max(...completedTerms.map((t) => orderTriangular(t.tri).right))
      : 1;
    const span = Math.max(1e-6, maxRight - minLeft);
    const steps = 300;
    const xs = Array.from(
      { length: steps + 1 },
      (_, i) => minLeft + (i * span) / steps
    );
    const toPoints = (tri: TriangularNumber) => {
      const o = orderTriangular(tri);
      return xs.map((x) => {
        if (x < o.left || x > o.right) return { x, y: 0 };
        if (x === o.middle) return { x, y: 1 };
        if (x < o.middle)
          return { x, y: (x - o.left) / (o.middle - o.left || 1) };
        return { x, y: (o.right - x) / (o.right - o.middle || 1) };
      });
    };

    const termDatasets: ChartDataset<"line", { x: number; y: number }[]>[] =
      completedTerms.map((t) => {
        const isCurrent = terms.indexOf(t) === currentTermIndex;
        const stroke = isCurrent ? "rgb(239,68,68)" : "rgb(37,99,235)";
        const fill = isCurrent ? "rgba(239,68,68,0.2)" : "rgba(37,99,235,0.15)";
        return {
          label: `${t.shortName} (${t.name})`,
          data: toPoints(t.tri),
          parsing: false,
          fill: true,
          borderColor: stroke,
          backgroundColor: fill,
          tension: 0,
          pointRadius: 0,
        };
      });

    const yAxisDataset: ChartDataset<"line", { x: number; y: number }[]> = {
      label: "y-axis",
      data: [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
      ],
      parsing: false,
      fill: false,
      borderColor: "rgba(0,0,0,0.5)",
      borderWidth: 1,
      pointRadius: 0,
      borderDash: [4, 4],
    };

    return {
      datasets: [...termDatasets, yAxisDataset],
    };
  }, [terms, currentTermIndex]);

  const chartOptions = useMemo(() => {
    const completedTerms = terms.filter((t) => isTriComplete(t.tri));
    const minLeft = completedTerms.length
      ? Math.min(...completedTerms.map((t) => orderTriangular(t.tri).left))
      : 0;
    const maxRight = completedTerms.length
      ? Math.max(...completedTerms.map((t) => orderTriangular(t.tri).right))
      : 1;

    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" as const },
      plugins: { legend: { display: true } },
      scales: {
        x: {
          type: "linear" as const,
          display: true,
          min: minLeft,
          max: maxRight,
        },
        y: { min: 0, max: 1, ticks: { stepSize: 0.2 } },
      },
    };
  }, [terms]);

  const renderCriteriaCellContent = (rowIndex: number, colIndex: number) => {
    if (isTransformedToTrapeze) {
      const trapeze = internalTrapezeMatrix[rowIndex]?.[colIndex];
      if (!trapeze) return "";
      return `${trapeze.a.toFixed(2)}; ${trapeze.b.toFixed(2)}; ${trapeze.c.toFixed(2)}; ${trapeze.d.toFixed(2)}`;
    }
    if (isTransformedToIntervals) {
      return internalIntervalLTSets[rowIndex]?.[colIndex]?.join(", ") || "";
    }
    return getCellText(tableData[rowIndex]?.[colIndex] || {});
  };

  if (currentPage === "evaluation") {
    return (
      <Box sx={{ p: 2 }}>
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            gap: 2,
          }}
        >
          {/* Left panel - Settings */}
          <Box
            sx={{
              flex: { xs: "0 0 auto", md: "0 0 300px" },
              backgroundColor: "#f4f6fb",
              p: 2,
              borderRadius: 1,
            }}
          >
            <Stack spacing={2}>
              <Typography variant="h6">Settings</Typography>
              <Button
                variant="contained"
                disabled={!isAllCellsFilled() || isTransformedToIntervals}
                onClick={handleTransformToIntervals}
              >
                Transform to intervals expert estimates
              </Button>
              <Button
                variant="contained"
                disabled={!isTransformedToIntervals || isTransformedToTrapeze}
                onClick={handleTransformToTrapeze}
              >
                Transform to trapeze linguistic terms
              </Button>
              <Select
                value={calculationMethod}
                onChange={handleCalculationMethodChange}
                fullWidth
              >
                <MenuItem value="generalized">Generalized</MenuItem>
                <MenuItem value="pessimistic">Pessimistic</MenuItem>
                <MenuItem value="optimistic">Optimistic</MenuItem>
              </Select>
              <Button
                variant="contained"
                disabled={!isTransformedToTrapeze}
                onClick={handleCalculateMethod}
              >
                Calculate method
              </Button>
            </Stack>
          </Box>

          {/* Right panel - Table */}
          <Box
            sx={{
              flex: "1 1 0",
              backgroundColor: "#ffffff",
              p: 2,
              borderRadius: 1,
              overflowX: "auto",
            }}
          >
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Alt.</TableCell>
                    {Array.from({ length: numCriterias }, (_, i) => (
                      <TableCell key={i} align="center">
                        C{i + 1}
                      </TableCell>
                    ))}
                    {/* --- GENERALIZED HEADERS --- */}
                    {displayResults.length > 0 &&
                      calculationMethod === "generalized" && (
                        <>
                          <TableCell>Fuzzy Intervals</TableCell>
                          <TableCell>Probability Generalized</TableCell>
                          <TableCell>Best Alternatives</TableCell>
                        </>
                      )}
                    {/* --- PESSIMISTIC HEADERS --- */}
                    {displayResults.length > 0 &&
                      calculationMethod === "pessimistic" && (
                        <>
                          <TableCell>Minimum Pessimistic</TableCell>
                          <TableCell>Probability Pessimistic</TableCell>
                          <TableCell>Result Pessimistic</TableCell>
                        </>
                      )}
                    {/* --- OPTIMISTIC HEADERS --- */}
                    {displayResults.length > 0 &&
                      calculationMethod === "optimistic" && (
                        <>
                          <TableCell>Maximum Optimistic</TableCell>
                          <TableCell>Probability Optimistic</TableCell>
                          <TableCell>Result Optimistic</TableCell>
                        </>
                      )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Array.from({ length: numAlternatives }, (_, rowIndex) => (
                    <TableRow key={rowIndex}>
                      <TableCell>A{rowIndex + 1}</TableCell>
                      {Array.from({ length: numCriterias }, (_, colIndex) => (
                        <TableCell
                          key={colIndex}
                          onClick={() => handleCellClick(rowIndex, colIndex)}
                          sx={{
                            cursor: isTransformedToIntervals
                              ? "default"
                              : "pointer",
                            backgroundColor: isTransformedToIntervals
                              ? "#f5f5f5"
                              : "inherit",
                            "&:hover": isTransformedToIntervals
                              ? {}
                              : { backgroundColor: "#f0f0f0" },
                          }}
                        >
                          {renderCriteriaCellContent(rowIndex, colIndex)}
                        </TableCell>
                      ))}
                      {/* --- GENERALIZED CELLS --- */}
                      {displayResults.length > 0 &&
                        calculationMethod === "generalized" && (
                          <>
                            <TableCell>
                              [{displayResults[rowIndex].genInterval?.l.toFixed(4)},{" "}
                              {displayResults[rowIndex].genInterval?.r.toFixed(4)}]
                            </TableCell>
                            <TableCell>
                              {displayResults[rowIndex].genProbability?.toFixed(4)}
                            </TableCell>
                            <TableCell>
                              {displayResults[rowIndex].genProbability === bestProbability
                                ? bestProbability?.toFixed(4)
                                : ""}
                            </TableCell>
                          </>
                        )}
                      {/* --- PESSIMISTIC CELLS --- */}
                      {displayResults.length > 0 &&
                        calculationMethod === "pessimistic" && (
                          <>
                            <TableCell>
                              [{displayResults[rowIndex].pessInterval?.l.toFixed(4)},{" "}
                              {displayResults[rowIndex].pessInterval?.r.toFixed(4)}]
                            </TableCell>
                            <TableCell>
                              {displayResults[rowIndex].pessProbability?.toFixed(4)}
                            </TableCell>
                            <TableCell>
                              {displayResults[rowIndex].pessProbability === bestProbability
                                ? bestProbability?.toFixed(4)
                                : ""}
                            </TableCell>
                          </>
                        )}
                      {/* --- OPTIMISTIC CELLS --- */}
                      {displayResults.length > 0 &&
                        calculationMethod === "optimistic" && (
                          <>
                            <TableCell>
                              [{displayResults[rowIndex].optInterval?.l.toFixed(4)},{" "}
                              {displayResults[rowIndex].optInterval?.r.toFixed(4)}]
                            </TableCell>
                            <TableCell>
                              {displayResults[rowIndex].optProbability?.toFixed(4)}
                            </TableCell>
                            <TableCell>
                              {displayResults[rowIndex].optProbability === bestProbability
                                ? bestProbability?.toFixed(4)
                                : ""}
                            </TableCell>
                          </>
                        )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Box>

        {/* Modal for cell editing */}
        <Dialog open={!!editingCell} onClose={() => setEditingCell(null)}>
          <DialogTitle>Edit Cell</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Select
                value={modalFrom}
                onChange={(e) => setModalFrom(e.target.value)}
                displayEmpty
                fullWidth
              >
                <MenuItem value="">None</MenuItem>
                {terms.map((term) => (
                  <MenuItem key={term.shortName} value={term.shortName}>
                    {term.shortName} ({term.name})
                  </MenuItem>
                ))}
              </Select>
              <Select
                value={modalTo}
                onChange={(e) => setModalTo(e.target.value)}
                displayEmpty
                fullWidth
              >
                <MenuItem value="">None</MenuItem>
                {terms.map((term) => (
                  <MenuItem key={term.shortName} value={term.shortName}>
                    {term.shortName} ({term.name})
                  </MenuItem>
                ))}
              </Select>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditingCell(null)}>Cancel</Button>
            <Button onClick={handleModalSave} variant="contained">
              Save
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  // ... The setup page JSX remains unchanged, so it is omitted for brevity
  // ... Paste the setup page return statement from your original file here
  return (
    <Box sx={{ p: 2 }}>
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          gap: 2,
        }}
      >
        {/* Left panel 30% */}
        <Box
          sx={{
            flex: { xs: "0 0 auto", md: "0 0 30%" },
            backgroundColor: "#f4f6fb",
            p: 2,
            borderRadius: 1,
          }}
        >
          <Stack spacing={2}>
            <Typography variant="h6">Settings</Typography>
            <TextField
              label="Number of alternatives"
              type="number"
              value={numAlternatives}
              onChange={(e) =>
                setNumAlternatives(Math.max(1, Number(e.target.value)))
              }
              inputProps={{ min: 1 }}
              fullWidth
            />
            <TextField
              label="Number of criterias"
              type="number"
              value={numCriterias}
              onChange={(e) =>
                setNumCriterias(Math.max(1, Number(e.target.value)))
              }
              inputProps={{ min: 1 }}
              fullWidth
            />
            <TextField
              label="Number of linguistic terms"
              type="number"
              value={numLinguisticTerms}
              onChange={(e) =>
                setNumLinguisticTerms(Math.max(1, Number(e.target.value)))
              }
              inputProps={{ min: 1 }}
              fullWidth
            />
            <TextField
              label="Alpha"
              type="number"
              value={alpha}
              onChange={(e) =>
                setAlpha(Math.max(0, Math.min(1, Number(e.target.value))))
              }
              inputProps={{ min: 0, max: 1, step: 0.01 }}
              fullWidth
            />
            <Stack direction="row" spacing={1}>
              <Button variant="contained">Accept</Button>
              <Button variant="outlined" color="secondary" onClick={resetAll}>
                Reset all
              </Button>
            </Stack>
          </Stack>
        </Box>

        {/* Right panel flexible */}
        <Box
          sx={{
            flex: "1 1 0",
            backgroundColor: "#ffffff",
            p: 2,
            borderRadius: 1,
          }}
        >
          <Stack spacing={2} sx={{ height: "80vh" }}>
            {/* Upper sub-panel */}
            <Box>
              <Typography variant="h6" gutterBottom>
                Triangular fuzzy number
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                <Stack spacing={1} sx={{ minWidth: 280 }}>
                  <TextField
                    label="Name"
                    value={currentTerm.name}
                    error={!!nameError}
                    helperText={nameError || " "}
                    onChange={(e) =>
                      upsertCurrentTerm({ name: e.target.value })
                    }
                    fullWidth
                  />
                  <TextField
                    label="Short name"
                    value={currentTerm.shortName}
                    error={!!shortNameError}
                    helperText={shortNameError || " "}
                    onChange={(e) =>
                      upsertCurrentTerm({ shortName: e.target.value })
                    }
                    fullWidth
                  />
                  <Stack direction="row" spacing={1} alignItems="center">
                    <IconButton onClick={handlePrev} aria-label="prev term">
                      <ArrowBackIosNewIcon />
                    </IconButton>
                    <Select
                      size="small"
                      value={terms.length ? String(currentTermIndex) : ""}
                      displayEmpty
                      onChange={(e) =>
                        setCurrentTermIndex(Number(e.target.value))
                      }
                      sx={{ minWidth: 100 }}
                    >
                      {terms.map((t, index) => (
                        <MenuItem
                          key={`${t.shortName}-${index}`}
                          value={String(index)}
                        >
                          Term {index + 1}
                        </MenuItem>
                      ))}
                    </Select>
                    <Typography>/ {numLinguisticTerms}</Typography>
                    <IconButton onClick={handleNext} aria-label="next term">
                      <ArrowForwardIosIcon />
                    </IconButton>
                  </Stack>
                </Stack>

                <Divider flexItem orientation="vertical" />

                <Stack spacing={2} sx={{ flex: 1 }}>
                  <TextField
                    label="Left"
                    type="number"
                    value={
                      Number.isNaN(currentTerm.tri.left)
                        ? ""
                        : currentTerm.tri.left
                    }
                    onChange={(e) =>
                      upsertCurrentTerm({
                        tri: {
                          ...currentTerm.tri,
                          left:
                            e.target.value === ""
                              ? Number.NaN
                              : Number(e.target.value),
                        },
                      })
                    }
                    slotProps={{ input: { inputMode: "decimal" } }}
                    fullWidth
                  />
                  <TextField
                    label="Middle"
                    type="number"
                    value={
                      Number.isNaN(currentTerm.tri.middle)
                        ? ""
                        : currentTerm.tri.middle
                    }
                    onChange={(e) =>
                      upsertCurrentTerm({
                        tri: {
                          ...currentTerm.tri,
                          middle:
                            e.target.value === ""
                              ? Number.NaN
                              : Number(e.target.value),
                        },
                      })
                    }
                    slotProps={{ input: { inputMode: "decimal" } }}
                    fullWidth
                  />
                  <TextField
                    label="Right"
                    type="number"
                    value={
                      Number.isNaN(currentTerm.tri.right)
                        ? ""
                        : currentTerm.tri.right
                    }
                    onChange={(e) =>
                      upsertCurrentTerm({
                        tri: {
                          ...currentTerm.tri,
                          right:
                            e.target.value === ""
                              ? Number.NaN
                              : Number(e.target.value),
                        },
                      })
                    }
                    slotProps={{ input: { inputMode: "decimal" } }}
                    fullWidth
                  />
                  {!!triError && (
                    <Typography variant="caption" color="error">
                      {triError}
                    </Typography>
                  )}
                </Stack>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  onClick={normalizeCurrentTerm}
                  disabled={
                    hasAnyError ||
                    (terms.length >= numLinguisticTerms &&
                      currentTermIndex >= terms.length)
                  }
                >
                  Normalize
                </Button>
                <Button variant="outlined" onClick={handleFinish}>
                  Finish
                </Button>
              </Stack>
            </Box>

            <Divider />

            {/* Bottom sub-panel - chart */}
            <Box sx={{ flex: 1, minHeight: 300 }}>
              <Line data={chartData} options={chartOptions} />
            </Box>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}

export default App;