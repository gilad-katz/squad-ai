import React, { useState } from 'react';

type Operator = '+' | '-' | '*' | '/' | null;

const performCalculation = (firstOperand: number, secondOperand: number, operator: Operator): number | string => {
  switch (operator) {
    case '+':
      return firstOperand + secondOperand;
    case '-':
      return firstOperand - secondOperand;
    case '*':
      return firstOperand * secondOperand;
    case '/':
      if (secondOperand === 0) return 'Error'; // Handle division by zero
      return firstOperand / secondOperand;
    default:
      return secondOperand;
  }
};

export const Calculator: React.FC = () => {
  const [displayValue, setDisplayValue] = useState<string>('0');
  const [firstOperand, setFirstOperand] = useState<number | null>(null);
  const [operator, setOperator] = useState<Operator>(null);
  const [waitingForSecondOperand, setWaitingForSecondOperand] = useState<boolean>(false);

  const handleDigit = (digit: string) => {
    if (waitingForSecondOperand) {
      setDisplayValue(digit);
      setWaitingForSecondOperand(false);
    } else {
      setDisplayValue(displayValue === '0' ? digit : displayValue + digit);
    }
  };

  const handleDecimal = () => {
    if (waitingForSecondOperand) {
      setDisplayValue('0.');
      setWaitingForSecondOperand(false);
      return;
    }
    if (!displayValue.includes('.')) {
      setDisplayValue(displayValue + '.');
    }
  };

  const handleOperator = (nextOperator: Operator) => {
    const inputValue = parseFloat(displayValue);

    if (firstOperand === null && !isNaN(inputValue)) {
      setFirstOperand(inputValue);
    } else if (operator && !waitingForSecondOperand) {
      const result = performCalculation(firstOperand!, inputValue, operator);
      if (typeof result === 'string') {
        setDisplayValue(result);
        setFirstOperand(null);
        setOperator(null);
        setWaitingForSecondOperand(true);
        return; // Stop further operations if error
      } else {
        setDisplayValue(String(result));
        setFirstOperand(result);
      }
    }

    setWaitingForSecondOperand(true);
    setOperator(nextOperator);
  };

  const handleEquals = () => {
    const inputValue = parseFloat(displayValue);

    if (firstOperand === null || operator === null || isNaN(inputValue)) {
      return;
    }

    const result = performCalculation(firstOperand, inputValue, operator);
    if (typeof result === 'string') {
      setDisplayValue(result);
      setFirstOperand(null);
      setOperator(null);
      setWaitingForSecondOperand(true);
    } else {
      setDisplayValue(String(result));
      setFirstOperand(result);
      setOperator(null);
      setWaitingForSecondOperand(true);
    }
  };

  const handleClear = () => {
    setDisplayValue('0');
    setFirstOperand(null);
    setOperator(null);
    setWaitingForSecondOperand(false);
  };

  const renderButton = (label: string, className: string = '', onClick: () => void) => (
    <button
      type="button"
      className={`p-4 text-2xl font-semibold bg-gray-200 hover:bg-gray-300 rounded-lg shadow-md transition-colors duration-200 ${className}`}
      onClick={onClick}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
        {/* Display */}
        <div className="bg-gray-800 text-white text-right p-5 mb-4 rounded-lg text-4xl font-mono overflow-hidden break-words min-h-[70px] flex items-center justify-end">
          {displayValue}
        </div>

        {/* Buttons Grid */}
        <div className="grid grid-cols-4 gap-3">
          {/* Row 1 */}
          {renderButton('AC', 'col-span-3 bg-red-500 hover:bg-red-600 text-white', handleClear)}
          {renderButton('/', 'bg-blue-500 hover:bg-blue-600 text-white', () => handleOperator('/'))}

          {/* Row 2 */}
          {renderButton('7', '', () => handleDigit('7'))}
          {renderButton('8', '', () => handleDigit('8'))}
          {renderButton('9', '', () => handleDigit('9'))}
          {renderButton('*', 'bg-blue-500 hover:bg-blue-600 text-white', () => handleOperator('*'))}

          {/* Row 3 */}
          {renderButton('4', '', () => handleDigit('4'))}
          {renderButton('5', '', () => handleDigit('5'))}
          {renderButton('6', '', () => handleDigit('6'))}
          {renderButton('-', 'bg-blue-500 hover:bg-blue-600 text-white', () => handleOperator('-'))}

          {/* Row 4 */}
          {renderButton('1', '', () => handleDigit('1'))}
          {renderButton('2', '', () => handleDigit('2'))}
          {renderButton('3', '', () => handleDigit('3'))}
          {renderButton('+', 'bg-blue-500 hover:bg-blue-600 text-white', () => handleOperator('+'))}

          {/* Row 5 */}
          {renderButton('0', 'col-span-2', () => handleDigit('0'))}
          {renderButton('.', '', handleDecimal)}
          {renderButton('=', 'bg-green-500 hover:bg-green-600 text-white', handleEquals)}
        </div>
      </div>
    </div>
  );
};
