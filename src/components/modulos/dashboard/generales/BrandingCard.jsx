import React from 'react';
import simboloEmeDigital from '../../../../assets/logo/emedigital-simbolo.svg';
import simboloEmeDigitalBlanco from '../../../../assets/logo/emedigital-simbolo-blanco.svg';

const URL_EMEDIGITAL = 'https://www.emedigital.cl';

const BrandingCard = () => {
  return (
    <div className="bg-gradient-to-r from-blue-50/50 to-transparent dark:from-blue-950/20 dark:to-transparent border border-blue-100/60 dark:border-blue-900/30 rounded-lg p-3 flex items-center gap-3">
      {/* Símbolo a color sobre el recuadro blanco; en modo oscuro, la versión blanca. */}
      <a
        href={URL_EMEDIGITAL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="EmeDigital (abre en una pestaña nueva)"
        className="w-10 h-10 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm"
      >
        <img src={simboloEmeDigital} alt="" className="w-7 h-7 object-contain dark:hidden" />
        <img src={simboloEmeDigitalBlanco} alt="" className="w-7 h-7 object-contain hidden dark:block" />
      </a>
      <div className="flex flex-col">
        <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Desarrollado por:</span>
        <h3 className="text-[13px] font-extrabold text-gray-800 dark:text-gray-100 tracking-wide">
          <a
            href={URL_EMEDIGITAL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-transparent underline-offset-2 transition-colors hover:text-[#208DD0] hover:decoration-current"
          >
            EmeDigital
          </a>
        </h3>
      </div>
    </div>
  );
};

export default BrandingCard;
