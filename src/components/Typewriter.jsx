import React, { useState, useEffect, useRef } from "react";

const Typewriter = ({ text, delay = 35, className = "" }) => {
  const [currentText, setCurrentText] = useState("");
  const [visible, setVisible] = useState(false);
  const elementRef = useRef();

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
        } else {
          setVisible(false);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) {
      setCurrentText("");
      return;
    }
    
    let index = 0;
    const interval = setInterval(() => {
      setCurrentText((prev) => prev + text.charAt(index));
      index++;
      if (index >= text.length) {
        clearInterval(interval);
      }
    }, delay);

    return () => clearInterval(interval);
  }, [visible, text, delay]);

  return <span ref={elementRef} className={className}>{currentText}</span>;
};

export default Typewriter;
