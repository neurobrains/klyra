"use client"
import React, { useEffect, useState } from "react";


const VapiAssistant = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    const assistantId = "5b794f61-b076-497f-9b10-4c0ab768cab8"; // Replace with your assistant ID
    const apiKey = "a39980da-e065-406f-a199-244c5c626869"; // Replace with your Public key

    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/gh/VapiAI/html-script-tag@latest/dist/assets/index.js";
    script.defer = true;
    script.async = true;

    script.onload = () => {
      if (window.vapiSDK) {
        // Log the vapiSDK object to check if it's available
        console.log("window.vapiSDK:", window.vapiSDK);

        window.vapiSDK.run({
          apiKey: apiKey,
          assistant: assistantId,
          config: {
            position: "center",
            idle: {
              color: "rgb(93, 254, 202)",
              type: "round",
              title: "Have a quick question?",
              icon: "https://unpkg.com/lucide-static@0.321.0/icons/phone.svg",
            },
            loading: {
              color: "rgb(93, 124, 202)",
              type: "round",
              title: "Connecting...",
              subtitle: "Please wait",
              icon: "https://unpkg.com/lucide-static@0.321.0/icons/loader-2.svg",
            },
            active: {
              color: "rgb(255, 0, 0)",
              type: "round",
              title: "Call is in progress...",
              subtitle: "End the call.",
              icon: "https://unpkg.com/lucide-static@0.321.0/icons/phone-off.svg",
            },
          },
        });  
      } else {
        console.error("vapiSDK is not loaded properly.");
      }
    };

    document.body.appendChild(script);

    // Cleanup script on component unmount
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <>
    
      <style jsx global>{`
        .vapi-btn {
          position: fixed !important;
          bottom: 100px !important;
          right: 32px !important;
          background: linear-gradient(135deg, #3B82F6, #A855F7, #F472B6) !important;
          color : white !important;
          transform: none !important;
          z-index: 1000;
          height:"50px",
          width:"50px
        }
        .vapi-btn {
          transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out;
        }
        .vapi-btn-is-idle {
          background: linear-gradient(135deg, #3B82F6, #A855F7, #F472B6) !important;
          color: #fff !important;
          border-radius: 25px !important;
        }
        .vapi-btn-is-loading {
          background: linear-gradient(135deg, #1D4ED8, #7C3AED, #DB2777) !important;
          color: #fff !important;
        }
        .vapi-btn-is-active {
          background: linear-gradient(135deg, #DC2626, #7C2D12, #991B1B) !important;
          color: #fff !important;
        }
        .vapi-btn-pill {
          width: 150px !important;
          height: 50px !important;
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
        }
        .vapi-btn-round {
          width: 70px !important;
          height: 70px !important;
          border-radius: 50% !important;
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
        }
      `}</style>
    </>
  );
};

export default VapiAssistant;