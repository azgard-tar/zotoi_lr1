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

    // Параметри трикутних чисел мають бути впорядковані (left <= middle <= right)
    const orderedTerms = triangularTerms.map((t) => orderTriangular(t));

    // Витягуємо параметри L, M, R з усіх трикутних чисел
    const lefts = orderedTerms.map((t) => t.left);
    const middles = orderedTerms.map((t) => t.middle);
    const rights = orderedTerms.map((t) => t.right);

    // Агрегація в трапеційний терм (a, b, c, d) [4, 10]
    // a = min(lefts); d = max(rights)
    // b = min(middles); c = max(middles)
    const a = Math.min(...lefts);
    const b = Math.min(...middles);
    const c = Math.max(...middles);
    const d = Math.max(...rights);

    return { a, b, c, d };
  };

  // Keep current index within bounds when terms array changes
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
    // Min–max normalization from [0, 100] to [0, 1]
    const { left, middle, right } = currentTerm.tri;
    const normalized = orderTriangular({
      left: left / 100,
      middle: middle / 100,
      right: right / 100,
    });
    upsertCurrentTerm({ tri: normalized });
  };

  const handleFinish = () => {
    // Initialize table with empty cells
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
    if (isTransformedToTrapeze) return; // Disable editing after trapeze transformation
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

    // Отримуємо впорядковані короткі імена термів
    const termShortNames = terms.map((t) => t.shortName);

    const intervalLTSets: string[][][] = tableData.map((row: CellValue[]) =>
      row.map((cell: CellValue) => {
        const { from, to } = cell;

        if (!from && !to) {
          return [];
        }

        // Якщо задано один терм
        if (from && from === to) {
          return [from];
        }

        // Логіка для "в межах (within)" [7]
        if (from && to) {
          const startIndex = termShortNames.indexOf(from);
          const endIndex = termShortNames.indexOf(to);

          if (startIndex !== -1 && endIndex !== -1) {
            const minIndex = Math.min(startIndex, endIndex);
            const maxIndex = Math.max(startIndex, endIndex);

            // Включаємо всі терми між from та to включно [1]
            return termShortNames.slice(minIndex, maxIndex + 1);
          }
        }

        // Логіка для "over" (вище) [8]
        if (from && !to) {
          const startIndex = termShortNames.indexOf(from);
          if (startIndex !== -1) {
            // Включаючи сам терм "from" і всі наступні
            return termShortNames.slice(startIndex);
          }
        }

        // Логіка для "less" (нижче) [8]
        if (!from && to) {
          const endIndex = termShortNames.indexOf(to);
          if (endIndex !== -1) {
            // Включаючи сам терм "to" і всі попередні
            return termShortNames.slice(0, endIndex + 1);
          }
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
          // Використовуємо хелпер з поточними термами
          const trapeze = getTrapezeFromLTSets(cellLTSets, terms);

          // Якщо трапеція не може бути сформована (наприклад, через помилку), використовуємо заглушку
          if (!trapeze) {
            // Повертаємо трапецію, яка не вплине на обчислення (наприклад, (0, 0, 0, 0))
            return { a: 0, b: 0, c: 0, d: 0 };
          }
          return trapeze;
        })
    );

    setInternalTrapezeMatrix(trapezeMatrix);
    setIsTransformedToTrapeze(true);
    // Reset calculation results
    setDisplayResults([]);
    setBestProbability(null);
  };

  // Хелпер функція для застосування α-перерізу (Крок 5)
  const getIntervalFromTrapeze = (
    trapeze: Trapeze,
    alpha: number
  ): Interval => {
    const { a, b, c, d } = trapeze;
    // Формула (1): [l, r] = [α*b + (1-α)*a, α*c + (1-α)*d] [5]
    // PDF Formula (1) is [α(a₂-a₁)+a₁, a₄-α(a₄-a₃)]
    // l = a + α(b - a) = a(1-α) + αb
    // r = d - α(d - c) = d(1-α) + αc
    const l = alpha * b + (1 - alpha) * a;
    const r = alpha * c + (1 - alpha) * d;
    return { l: l, r: r };
  };

  // Хелпер функція для розрахунку показника ймовірності (Крок 6)
  // Використовуємо формулу (3) з PDF: p(I >= [0,1]) = max(1 - max((1-l)/(r-l+1), 0), 0)
  const calculateProbability = (interval: Interval): number => {
    const { l, r } = interval;

    // This formula matches the results from the PDF and screenshots
    const prob = Math.max(1 - Math.max((1 - l) / (r - l + 1), 0), 0);
    return prob;
  };

  const handleCalculateMethod = () => {
    console.log("Calculating with method:", calculationMethod);

    if (!isTransformedToTrapeze || internalTrapezeMatrix.length === 0) {
      console.error("Trapeze matrix is not ready. Run transformation first.");
      return;
    }

    const trapezeMatrix = internalTrapezeMatrix;
    const currentNumAlternatives = numAlternatives;
    const currentNumCriterias = numCriterias;
    const results: DisplayResult[] = Array.from(
      { length: currentNumAlternatives },
      () => ({})
    );
    let maxProbability = -1;

    // --- 1. Обчислення інтервалів I_ij (α-переріз) для всіх методів ---
    const intervalMatrix: Interval[][] = trapezeMatrix.map((row) =>
      row.map((trapeze) => getIntervalFromTrapeze(trapeze, alpha))
    );

    for (let i = 0; i < currentNumAlternatives; i++) {
      const trapezesForAlternative = trapezeMatrix[i];
      const intervalsForAlternative = intervalMatrix[i];
      let finalInterval: Interval;
      let probability: number;

      if (
        currentNumCriterias === 0 ||
        intervalsForAlternative.length === 0 ||
        trapezesForAlternative.length === 0
      )
        continue;

      if (calculationMethod === "generalized") {
        // GENERALIZED (Узагальнений) [2]:
        // Крок 4: Агрегація T_ij в комбінований трапеційний терм GS_i (Min/Min/Max/Max)
        const min_a = Math.min(
          ...trapezesForAlternative.map((trap) => trap.a)
        );
        const min_b = Math.min(
          ...trapezesForAlternative.map((trap) => trap.b)
        );
        const max_c = Math.max(
          ...trapezesForAlternative.map((trap) => trap.c)
        );
        const max_d = Math.max(
          ...trapezesForAlternative.map((trap) => trap.d)
        );

        const T_i_combined: Trapeze = {
          a: min_a,
          b: min_b,
          c: max_c,
          d: max_d,
        };

        // Крок 5: Трансформація T_i_combined в інтервал I_i (α-cut)
        finalInterval = getIntervalFromTrapeze(T_i_combined, alpha);
        probability = calculateProbability(finalInterval);

        results[i] = {
          ...results[i],
          genInterval: finalInterval,
          genProbability: probability,
        };
        if (probability > maxProbability) maxProbability = probability;
      } else if (calculationMethod === "pessimistic") {
        // PESSIMISTIC (Песимістичний) [11]: MIN операція на I_ij (Крок 6)
        // I_i = [ min(l_j), min(r_j) ] (Формула 2)

        const min_l = Math.min(
          ...intervalsForAlternative.map((inv) => inv.l)
        );
        const min_r = Math.min(
          ...intervalsForAlternative.map((inv) => inv.r)
        );
        finalInterval = { l: min_l, r: min_r };
        probability = calculateProbability(finalInterval);

        results[i] = {
          ...results[i],
          pessInterval: finalInterval,
          pessProbability: probability,
        };
        if (probability > maxProbability) maxProbability = probability;
      } else if (calculationMethod === "optimistic") {
        // OPTIMISTIC (Оптимістичний) [12]: MAX операція на I_ij (Крок 6)
        // I_i = [ max(l_j), max(r_j) ]

        const max_l = Math.max(
          ...intervalsForAlternative.map((inv) => inv.l)
        );
        const max_r = Math.max(
          ...intervalsForAlternative.map((inv) => inv.r)
        );
        finalInterval = { l: max_l, r: max_r };
        probability = calculateProbability(finalInterval);

        results[i] = {
          ...results[i],
          optInterval: finalInterval,
          optProbability: probability,
        };
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

          {/* Right panel - Main Table & Results Table */}
          <Box
            sx={{
              flex: "1 1 0",
              backgroundColor: "#ffffff",
              p: 2,
              borderRadius: 1,
              overflowX: "auto",
            }}
          >
            {/* --- MAIN CRITERIA TABLE --- */}
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
                            minWidth: 100,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {renderCriteriaCellContent(rowIndex, colIndex)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* --- NEW CALCULATION RESULTS TABLE --- */}
            {displayResults.length > 0 && (
              <Box mt={4}>
                <Typography variant="h6" gutterBottom>
                  Calculation Results (Method: {calculationMethod})
                </Typography>
                <TableContainer component={Paper}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Alternative</TableCell>
                        {/* --- GENERALIZED HEADERS --- */}
                        {calculationMethod === "generalized" && (
                          <>
                            <TableCell>Fuzzy Intervals</TableCell>
                            <TableCell>Probability Generalized</TableCell>
                            <TableCell>Best Alternatives</TableCell>
                          </>
                        )}
                        {/* --- PESSIMISTIC HEADERS --- */}
                        {calculationMethod === "pessimistic" && (
                          <>
                            <TableCell>Minimum Pessimistic</TableCell>
                            <TableCell>Probability Pessimistic</TableCell>
                            <TableCell>Result Pessimistic</TableCell>
                          </>
                        )}
                        {/* --- OPTIMISTIC HEADERS --- */}
                        {calculationMethod === "optimistic" && (
                          <>
                            <TableCell>Maximum Optimistic</TableCell>
                            <TableCell>Probability Optimistic</TableCell>
                            <TableCell>Result Optimistic</TableCell>
                          </>
                        )}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {displayResults.map((res, rowIndex) => (
                        <TableRow key={rowIndex}>
                          <TableCell>A{rowIndex + 1}</TableCell>
                          {/* --- GENERALIZED CELLS --- */}
                          {calculationMethod === "generalized" && (
                            <>
                              <TableCell sx={{ whiteSpace: "nowrap" }}>
                                [
                                {res.genInterval?.l.toFixed(4)}
                                , {res.genInterval?.r.toFixed(4)}
                                ]
                              </TableCell>
                              <TableCell>
                                {res.genProbability?.toFixed(4)}
                              </TableCell>
                              <TableCell
                                sx={{
                                  backgroundColor:
                                    res.genProbability === bestProbability
                                      ? "#d7fcdf"
                                      : "inherit",
                                }}
                              >
                                {res.genProbability === bestProbability
                                  ? bestProbability?.toFixed(4)
                                  : ""}
                              </TableCell>
                            </>
                          )}
                          {/* --- PESSIMISTIC CELLS --- */}
                          {calculationMethod === "pessimistic" && (
                            <>
                              <TableCell sx={{ whiteSpace: "nowrap" }}>
                                [
                                {res.pessInterval?.l.toFixed(4)}
                                , {res.pessInterval?.r.toFixed(4)}
                                ]
                              </TableCell>
                              <TableCell>
                                {res.pessProbability?.toFixed(4)}
                              </TableCell>
                              <TableCell
                                sx={{
                                  backgroundColor:
                                    res.pessProbability === bestProbability
                                      ? "#d7fcdf"
                                      : "inherit",
                                }}
                              >
                                {res.pessProbability === bestProbability
                                  ? bestProbability?.toFixed(4)
                                  : ""}
                              </TableCell>
                            </>
                          )}
                          {/* --- OPTIMISTIC CELLS --- */}
                          {calculationMethod === "optimistic" && (
                            <>
                              <TableCell sx={{ whiteSpace: "nowrap" }}>
                                [
                                {res.optInterval?.l.toFixed(4)}
                                , {res.optInterval?.r.toFixed(4)}
                                ]
                              </TableCell>
                              <TableCell>
                                {res.optProbability?.toFixed(4)}
                              </TableCell>
                              <TableCell
                                sx={{
                                  backgroundColor:
                                    res.optProbability === bestProbability
                                      ? "#d7fcdf"
                                      : "inherit",
                                }}
                              >
                                {res.optProbability === bestProbability
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
            )}
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