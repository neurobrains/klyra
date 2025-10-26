"use client";
import React, { useEffect, useRef, useState } from "react";
import {
  ChatBubbleOvalLeftEllipsisIcon,
  PaperAirplaneIcon,
  TrashIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/solid";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import chatIcon from "../../public/assets/klassy.png";
import Image from "next/image";
import { Separator } from "@/components/ui/separator";
import { Icon } from "@iconify/react";
import axios from "axios";
import { marked } from "marked";

import { Card, CardContent } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

const MessageAndCall = () => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const textareaRef = useRef(null);
  const chatContainerRef = useRef(null);
  const [message, setMessage] = useState("");
  const [img, setImg] = useState();
  const [preview, setPreview] = useState(null);
  const [imgUrl,setImgUrl] = useState();
  const [products, setProducts] = useState([]);
  const [chatHistory, setChatHistory] = useState([
    {
      sender: "bot",
      text: "👋 Hi! I'm NeuroBrain Chatbot. Nice to meet you. How may I help you today?",
      image: "",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [suggestQuestion, setSuggestQuestion] = useState([]);
  const fileInputRef = useRef(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [userName, setUserName] = useState("");
  const [showNameInput, setShowNameInput] = useState(false);
  const [typingMessageIndex, setTypingMessageIndex] = useState(-1);
  const [displayedText, setDisplayedText] = useState("");

  // Advanced responsive calculations
  useEffect(() => {
    const updateViewport = () => {
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      setViewportHeight(vh);
      setIsMobile(vw < 640); // sm breakpoint
      
      // Set CSS custom properties for dynamic calculations
      document.documentElement.style.setProperty('--vh', `${vh * 0.01}px`);
      document.documentElement.style.setProperty('--vw', `${vw * 0.01}px`);
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);

    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);

  // Calculate dynamic positioning to prevent header cutoff
  const getPopoverStyle = () => {
    const headerHeight = 80; // Approximate header height
    const chatbotHeight = isMobile ? Math.min(viewportHeight * 0.9, 650) : Math.min(viewportHeight * 0.85, 750);
    const bottomOffset = 16; // Reduced space from bottom
    
    return {
      maxHeight: `${chatbotHeight}px`,
      marginBottom: `${bottomOffset}px`,
    };
  };

  const handleIconClick = () => {
    // Trigger the file input click
    fileInputRef.current.click();
  };

  // Scroll to bottom function
  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImg(file);
      setPreview(URL.createObjectURL(file));
      // Delay the upload until the state is updated
      uploadImage(file); 
    }
  };
  
  async function uploadImage(file) {
    const data = new FormData();
    data.append("file", file);
    data.append("upload_preset", "lt2tb7ci");
  
    try {
      let res = await fetch("https://api.cloudinary.com/v1_1/dddvfrdb1/image/upload", {
        method: "POST",
        body: data,
      });
  
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
  
      const urlData = await res.json();
      setImgUrl(urlData.secure_url); // Use secure_url for HTTPS
      console.log("Image URL:", urlData.secure_url);
    } catch (error) {
      console.error("Error uploading image:", error);
    }
  }


  useEffect(() => {
    const savedChatHistory = localStorage.getItem("chatHistory");
    if (savedChatHistory) {
      setChatHistory(JSON.parse(savedChatHistory));
    }
    
    // Check for saved user name
    const savedUserName = localStorage.getItem("userName");
    if (savedUserName) {
      setUserName(savedUserName);
    } else {
      setShowNameInput(true);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("chatHistory", JSON.stringify(chatHistory));
  }, [chatHistory]);

  // Auto scroll when chatbot opens
  useEffect(() => {
    if (isPopoverOpen) {
      // Small delay to ensure the popover is fully rendered
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }, [isPopoverOpen]);

  // Auto scroll when new messages are added
  useEffect(() => {
    if (chatHistory.length > 0) {
      setTimeout(() => {
        scrollToBottom();
      }, 50);
    }
  }, [chatHistory.length]);

  const handleSendMessage = (suggest) => {
    if (!message.trim() && !suggest) return;

    const userMessage = {
      sender: "user",
      text: message || suggest,
      image: imgUrl,
    };
    setChatHistory((prev) => [...prev, userMessage]);
    setMessage("");
    setLoading(true);
    
    // Clear image immediately after sending
    setImg("");
    setImgUrl("");
    setPreview("");

    const data = {
      query: message || suggest,
      userId: userName || "guest",
      domain: "https://klassy.com.bd/",
    };
    
    // Only add image if it exists
    if (img) {
      data.image = img;
    }
    axios
      .post(
        `http://localhost:8000/chat`,
        data,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      )
      .then((res) => {
        const data = {
          user_message: message || suggest,
          ai_response: res?.data?.response,
        };

        axios
          .post(
            `http://localhost:8000/generate_questions`,
            data,
            {
              headers: {
                "Content-Type": "application/json",
              },
            }
          )
          .then((response) => {
            const questionsString = response?.data?.questions;
            const questionsArray = questionsString
              ?.split(", ")
              .map((question) => question.trim());
            setSuggestQuestion(questionsArray);
          })
          .catch((err) => console.log(err));

        const botResponse = {
          sender: "bot",
          text: res.data.response || "Sorry, I didn't understand that.",
          products: res?.data?.products || [], // Store products with the message
        };
        console.log("response:",res);
        setChatHistory((prev) => {
          const newHistory = [...prev, botResponse];
          // Start typewriter effect for the new bot message
          setTimeout(() => {
            startTypewriter(botResponse.text, newHistory.length - 1);
          }, 100);
          return newHistory;
        });
          setProducts(res?.data?.products);
          setMessage("");
      })
      .catch((error) => {
        const errorResponse = {
          sender: "bot",
          text: "An error occurred while connecting to the server. Please try again later.",
        };
        setChatHistory((prev) => [...prev, errorResponse]);
        setMessage("");
        console.error("Error:", error.response?.data || error.message);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInput = (e) => {
    const textarea = textareaRef.current;
    textarea.style.height = "auto";
    const maxRows = 3;
    const lineHeight = parseInt(
      window.getComputedStyle(textarea).lineHeight,
      10
    );
    const maxHeight = lineHeight * maxRows;

    if (textarea.scrollHeight > maxHeight) {
      textarea.style.height = `${maxHeight}px`;
      textarea.style.overflowY = "scroll";
    } else {
      textarea.style.height = `${textarea.scrollHeight}px`;
      textarea.style.overflowY = "hidden";
    }
  };

  const handleSuggest = (suggest) => {
    setPreview("");
    handleSendMessage(suggest);
  };

  const deleteChatHistory = () => {
    setChatHistory([
      {
        sender: "bot",
        text: "👋 Hi! I'm Klassy AI Chatbot. It's great to meet you! How can I assist you today?",
      },
    ]);
    localStorage.removeItem("chatHistory");
  };

  const handleNameSubmit = (name) => {
    if (name.trim()) {
      setUserName(name.trim());
      localStorage.setItem("userName", name.trim());
      setShowNameInput(false);
      
      // Update welcome message with user name
      setChatHistory([
        {
          sender: "bot",
          text: `👋 Hi ${name.trim()}! I'm Klassy AI Chatbot. It's great to meet you! How can I assist you today?`,
        },
      ]);
    }
  };

  // Typewriter effect function with requestAnimationFrame for smoothness
  const startTypewriter = (text, messageIndex) => {
    setTypingMessageIndex(messageIndex);
    setDisplayedText("");
    
    let currentIndex = 0;
    let lastTime = 0;
    const typeSpeed = 2; // milliseconds per character
    
    const animate = (currentTime) => {
      if (currentTime - lastTime >= typeSpeed) {
        if (currentIndex < text.length) {
          setDisplayedText(text.substring(0, currentIndex + 1));
          currentIndex++;
          lastTime = currentTime;
        } else {
          setTypingMessageIndex(-1);
          setDisplayedText("");
          // Scroll to bottom when typing is complete
          setTimeout(() => {
            scrollToBottom();
          }, 100);
          return;
        }
      }
      
      if (currentIndex < text.length) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  };

  // Function to render AI response with embedded product carousel
  const renderBotMessage = (msg, index) => {
    const messageText = msg.text;
    const messageProducts = msg.products || []; // Store products with the message
    const hasProducts = messageProducts.length > 0;
    
    // Use typewriter text if this message is currently being typed
    const textToDisplay = typingMessageIndex === index ? displayedText : messageText;
    
    // Check if this message should include products
    if (hasProducts && (messageText.toLowerCase().includes("recommendations") || messageText.toLowerCase().includes("products") || messageText.toLowerCase().includes("help"))) {
      // Split the message at the point where we want to insert the carousel
      const lowerText = messageText.toLowerCase();
      let insertPoint = messageText.length;
      
      // More precise detection patterns
      const patterns = [
        "here are some products that might be helpful",
        "here are some product recommendations",
        "here are some recommendations",
        "now, here are some products",
        "here are some products",
        "product recommendations that can help",
        "recommendations that can help",
        "products that might help",
        "some products that",
        "recommendations:",
        "here are products",
        "some product recommendations",
        "product suggestions",
        "recommended products",
        "these products"
      ];
      
      for (const pattern of patterns) {
        const index = lowerText.indexOf(pattern);
        if (index !== -1) {
          // Find the end of the sentence (look for : or . or end of line)
          let endIndex = index + pattern.length;
          const restOfText = messageText.substring(endIndex);
          
          // Look for punctuation that indicates end of the introductory sentence
          const colonIndex = restOfText.indexOf(':');
          const periodIndex = restOfText.indexOf('.');
          const newlineIndex = restOfText.indexOf('\n');
          const doubleNewlineIndex = restOfText.indexOf('\n\n');
          
          // Prioritize colon as it often indicates a list follows
          if (colonIndex !== -1 && colonIndex < 30) {
            endIndex += colonIndex + 1;
            // Skip any whitespace or newlines after the colon
            while (endIndex < messageText.length && /\s/.test(messageText[endIndex])) {
              endIndex++;
            }
          } else if (doubleNewlineIndex !== -1 && doubleNewlineIndex < 100) {
            endIndex += doubleNewlineIndex + 2;
          } else if (newlineIndex !== -1 && newlineIndex < 50) {
            endIndex += newlineIndex + 1;
          } else if (periodIndex !== -1 && periodIndex < 100) {
            endIndex += periodIndex + 1;
            // Skip whitespace after period
            while (endIndex < messageText.length && /\s/.test(messageText[endIndex])) {
              endIndex++;
            }
          }
          
          insertPoint = endIndex;
          break;
        }
      }
      
      const beforeCarousel = textToDisplay.substring(0, Math.min(insertPoint, textToDisplay.length));
      const afterCarousel = textToDisplay.length > insertPoint ? textToDisplay.substring(insertPoint) : "";
      const isTyping = typingMessageIndex === index;
      
      return (
        <div className="space-y-3">
          {/* Text before carousel */}
          {beforeCarousel && (
            <div
              className="typewriter-text"
              dangerouslySetInnerHTML={{
                __html: marked(beforeCarousel),
              }}
            />
          )}
          
          {/* Embedded Product Carousel - only show when typing reaches this point */}
          {(!isTyping || textToDisplay.length >= insertPoint) && (
            <div 
              className="my-4 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4 rounded-2xl border border-blue-200 shadow-sm animate-fade-in"
              onAnimationEnd={() => {
                // Scroll to bottom when carousel animation completes
                setTimeout(() => {
                  scrollToBottom();
                }, 50);
              }}
            >
            <div className="mb-3">
              <h4 className="text-base font-bold text-blue-900 flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                Recommended Products ({messageProducts.length})
              </h4>
              <p className="text-xs text-blue-700 mt-1">Curated just for you</p>
            </div>
            <Carousel 
              className="w-full"
              opts={{
                align: "start",
                loop: messageProducts.length > 1,
              }}
            >
              <CarouselContent className="-ml-2">
                {messageProducts.map((item, productIndex) => (
                  <CarouselItem key={`${item.id || productIndex}-${index}`} className="pl-2 basis-full">
                    <Card className="transition-all duration-300 hover:shadow-2xl border-0 bg-white hover:bg-gradient-to-br hover:from-white hover:to-blue-50 group overflow-hidden">
                      <CardContent className="p-0">
                        <div className="relative">
                          {/* Product Image Section */}
                          <div className="relative bg-gradient-to-br from-gray-50 to-gray-100 p-4 rounded-t-2xl">
                            <div className="flex justify-center">
                              <div className="relative">
                                <img
                                  src={item.image_url || item.image}
                                  alt={item.name || 'Product'}
                                  className="h-32 w-32 object-cover rounded-2xl shadow-lg border-4 border-white group-hover:scale-105 transition-transform duration-300"
                                  onError={(e) => {
                                    e.target.src = 'https://via.placeholder.com/128x128?text=No+Image&color=3B82F6&bg=EBF8FF';
                                  }}
                                />
                                <div className="absolute -top-2 -right-2 bg-gradient-to-r from-green-400 to-green-500 text-white text-xs px-2 py-1 rounded-full font-bold shadow-md">
                                  NEW
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          {/* Product Details Section */}
                          <div className="p-4 space-y-3">
                            <div className="text-center">
                              <h4 className="text-base font-bold text-gray-900 line-clamp-2 group-hover:text-blue-800 transition-colors">
                                {item.name || 'Product Name'}
                              </h4>
                            </div>
                            
                            {/* Highlights */}
                            {item.highlights && (
                              <div className="bg-gradient-to-r from-blue-100 to-indigo-100 p-3 rounded-xl border border-blue-200">
                                <div className="text-xs text-blue-800 font-semibold mb-1 flex items-center gap-1">
                                  <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                                  Key Benefits
                                </div>
                                <p className="text-xs text-blue-700 line-clamp-3 leading-relaxed">
                                  {item.highlights}
                                </p>
                              </div>
                            )}
                            
                            {/* Price Section */}
                            <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-3 rounded-xl border border-green-200">
                              <div className="flex items-center justify-center gap-2">
                                <span className="text-xl font-bold text-green-700">
                                  {item.price || 'Price not available'}
                                </span>
                                {item.original_price && (
                                  <span className="text-sm text-gray-500 line-through">
                                    {item.original_price}
                                  </span>
                                )}
                              </div>
                              {item.original_price && (
                                <p className="text-xs text-green-600 text-center mt-1 font-medium">
                                  Save {parseInt(item.original_price) - parseInt(item.price || 0)}TK
                                </p>
                              )}
                            </div>
                            
                            {/* Buy Button */}
                            <button
                              onClick={() => {
                                if (item.buy_link) {
                                  window.open(item.buy_link, "_blank");
                                } else {
                                  console.log('No buy link available for:', item.name);
                                }
                              }}
                              className="w-full bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white px-4 py-3 rounded-xl hover:from-blue-700 hover:via-blue-800 hover:to-indigo-800 transition-all duration-300 text-sm font-bold shadow-lg hover:shadow-xl transform hover:scale-105 hover:-translate-y-1"
                            >
                              <span className="flex items-center justify-center gap-2">
                                Buy Now
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                              </span>
                            </button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </CarouselItem>
                ))}
              </CarouselContent>
              {messageProducts.length > 1 && (
                <>
                  <CarouselPrevious className="-left-10 h-10 w-10 bg-white hover:bg-blue-50 border-2 border-blue-300 text-blue-700 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-110" />
                  <CarouselNext className="-right-10 h-10 w-10 bg-white hover:bg-blue-50 border-2 border-blue-300 text-blue-700 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-110" />
                </>
              )}
            </Carousel>
            </div>
          )}
          
          {/* Text after carousel */}
          {afterCarousel && (
            <div
              className="typewriter-text"
              dangerouslySetInnerHTML={{
                __html: marked(afterCarousel),
              }}
            />
          )}
        </div>
      );
    }
    
    // Regular message without products
    return (
      <div
        className="typewriter-text"
        dangerouslySetInnerHTML={{
          __html: marked(textToDisplay),
        }}
      />
    );
  };

  return (
    <>
      {/* Name Input Modal */}
      {showNameInput && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-90 mx-4 shadow-xl">
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Image
                  src={chatIcon}
                  alt="Klassy AI"
                  className="w-12 h-12 rounded-full"
                  width={48}
                  height={48}
                />
              </div>
              <h3 className="text-lg font-semibold text-gray-800">Welcome to Klassy AI!</h3>
              <p className="text-sm text-gray-600 mt-1">Please enter your name to get started</p>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              handleNameSubmit(formData.get('name'));
            }}>
              <input
                type="text"
                name="name"
                placeholder="Enter your name..."
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 text-sm"
                required
                autoFocus
              />
              <button
                type="submit"
                className="w-full mt-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-200 font-medium"
              >
                Start Chatting
              </button>
            </form>
          </div>
        </div>
      )}


      <div>
        {isPopoverOpen ? null : (
          <div className="fixed bottom-8 right-20 sm:right-24 bg-orange-50 text-xs sm:text-sm rounded-tl-full rounded-bl-full rounded-br-full p-2 shadow-xl cursor-pointer transition-all duration-200 hover:shadow-2xl">
            <p className="whitespace-nowrap">Chat with us</p>
          </div>
        )}
        <div className={`fixed bottom-8 right-6 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-full p-3 shadow-lg cursor-pointer hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 transition-all duration-200 hover:shadow-xl hover:scale-105 ${!isPopoverOpen ? 'animate-pulse-glow' : ''}`}>
          <Popover onOpenChange={(open) => setIsPopoverOpen(open)}>
            <PopoverTrigger asChild>
              {isPopoverOpen ? (
                <ChevronDownIcon className="h-7 w-7 text-white" />
              ) : (
                <ChatBubbleOvalLeftEllipsisIcon className="h-7 w-7 text-white" />
              )}
            </PopoverTrigger>

            <PopoverContent 
              className="w-96 sm:w-[420px] p-0 bg-transparent shadow-none border-none mr-4 chatbot-popover"
              style={getPopoverStyle()}
              align="end"
              sideOffset={4}
            >
              <div className="w-full h-full">
                <div className="w-full h-full mx-auto border rounded-lg shadow-lg bg-white animate-slide-in-up flex flex-col chatbot-container prevent-overflow">
                  <div
                    className="flex-shrink-0 p-4 rounded-t-lg flex items-center justify-between relative overflow-hidden"
                    style={{
                      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                    }}
                  >
                    {/* Background Pattern */}
                    <div className="absolute inset-0 opacity-10">
                      <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent"></div>
                    </div>
                    
                    <div className="flex items-center space-x-3 relative z-10">
                      <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                        <Image
                          src={chatIcon}
                          alt="Chatbot Logo"
                          className="w-9 h-9 rounded-full"
                          width={36}
                          height={36}
                        />
                      </div>
                      <div>
                        <h4 className="text-white text-lg font-bold tracking-wide">
                          Klyra AI Chatbot
                        </h4>
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                          <p className="text-sm text-white/90 font-medium">
                            Skin Intelligence • Online
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2 relative z-10">
                      <button
                        onClick={deleteChatHistory}
                        className="p-2 hover:bg-white/20 rounded-full transition-colors duration-200"
                        title="Clear Chat History"
                      >
                        <TrashIcon className="h-5 w-5 text-white" />
                      </button>
                      <button className="p-2 hover:bg-white/20 rounded-full transition-colors duration-200">
                        <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div 
                    ref={chatContainerRef}
                    className="flex-1 p-3 sm:p-4 bg-gray-50 space-y-3 sm:space-y-4 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 min-h-0"
                  >
                    {chatHistory.map((msg, index) => (
                      <div
                        key={index}
                        className={`flex ${
                          msg.sender === "bot" ? "flex-row" : "flex-row-reverse"
                        } items-start space-x-3 animate-message-slide-in`}
                      >
                        {/* Avatar for bot messages */}
                        {msg.sender === "bot" && (
                          <div className="w-8 h-8 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
                            <Image
                              src={chatIcon}
                              alt="AI Assistant"
                              className="w-6 h-6 rounded-full"
                              width={24}
                              height={24}
                            />
                          </div>
                        )}
                        
                        <div
                          className={`${
                            msg.sender === "bot"
                              ? "bg-white border border-gray-200 shadow-sm"
                              : "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md"
                          } p-3 sm:p-4 rounded-2xl text-sm max-w-[85%] sm:max-w-[80%] transition-all duration-200 hover:shadow-lg`}
                          style={{ minHeight: '2.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
                        >
                          {/* Render Image if Present */}
                          {msg.image && (
                            <div>
                              <img
                                src={msg.image}
                                alt="Preview"
                                className="w-full h-32 sm:h-40 object-cover rounded-lg mb-2"
                              />
                            </div>
                          )}

                          {/* Render Text with embedded products if applicable */}
                          {msg.sender === "bot" ? renderBotMessage(msg, index) : (
                          <div
                            dangerouslySetInnerHTML={{
                              __html: marked(msg.text),
                            }}
                          />
                          )}
                        </div>
                      </div>
                    ))}
                    {loading && (
                      <div className="flex flex-row items-start space-x-3">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center shadow-sm">
                          <Image
                            src={chatIcon}
                            alt="Chatbot Logo"
                            className="w-6 h-6 sm:w-8 sm:h-8 rounded-full"
                            width={32}
                            height={32}
                          />
                        </div>
                        <div className="bg-white border border-gray-200 p-4 rounded-2xl shadow-sm max-w-[85%]">
                          <div className="flex items-center space-x-2">
                            <div className="flex space-x-1">
                              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                            </div>
                            <span className="text-xs text-gray-500 ml-2">AI is thinking...</span>
                          </div>
                        </div>
                      </div>
                    )}


                    {!loading && (
                      <div className="mt-3">
                        <div className="mb-2">
                          <p className="text-xs text-gray-600 font-medium px-1">
                            Quick Questions:
                          </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {suggestQuestion?.length > 0 ? (
                          <>
                              {suggestQuestion?.map((buttonText, index) => (
                              <button
                                  key={`${buttonText}-${index}`}
                                onClick={() => handleSuggest(buttonText)}
                                  className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 text-blue-700 px-3 py-2 rounded-xl hover:from-blue-500 hover:to-indigo-500 hover:text-white hover:border-blue-500 transition-all duration-200 text-xs sm:text-sm font-medium shadow-sm hover:shadow-md transform hover:scale-105"
                              >
                                {buttonText}
                              </button>
                            ))}
                          </>
                        ) : (
                          <>
                            {[
                              "How to Get Glowing Skin?",
                              "Best Acne Treatment Options",
                              "How to Reduce Wrinkles?",
                              "Natural Remedies for Dry Skin",
                              ].map((buttonText, index) => (
                              <button
                                  key={`default-${index}`}
                                onClick={() => handleSuggest(buttonText)}
                                  className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 text-blue-700 px-3 py-2 rounded-xl hover:from-blue-500 hover:to-indigo-500 hover:text-white hover:border-blue-500 transition-all duration-200 text-xs sm:text-sm font-medium shadow-sm hover:shadow-md transform hover:scale-105"
                              >
                                {buttonText}
                              </button>
                            ))}
                          </>
                        )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex-shrink-0 flex items-center space-x-3 px-3 sm:px-4 py-3 bg-white border-t border-gray-200">
                    <textarea
                      ref={textareaRef}
                      rows={1}
                      placeholder="Type your message here..."
                      required
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onInput={handleInput}
                      onKeyDown={handleKeyDown}
                      disabled={loading}
                      className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 resize-none text-sm sm:text-base transition-all duration-200 bg-gray-50 focus:bg-white placeholder-gray-500"
                      style={{ lineHeight: "1em", height: "45px", overflowY: "hidden" }}
                    />
                    {preview ? (
                      <div className="relative">
                        <img
                          src={preview}
                          alt="Preview"
                          className="w-10 h-10 sm:w-12 sm:h-12 object-cover rounded-xl border-2 border-blue-200"
                        />
                        <button
                          onClick={() => {
                            setPreview("");
                            setImg("");
                            setImgUrl("");
                          }}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600 transition-colors shadow-md"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          type="file"
                          ref={fileInputRef}
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={handleFileChange}
                        />
                        <button
                          onClick={handleIconClick}
                          className="p-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors duration-200 border border-gray-200"
                          title="Upload Image"
                        >
                          <Icon icon="proicons:photo" width={20} height={20} className="text-gray-600" />
                        </button>
                      </div>
                    )}

                    <button
                      onClick={handleSendMessage}
                      disabled={!message.trim() || loading}
                      className={`p-3 rounded-xl text-white transition-all duration-200 ${
                        message.trim() && !loading
                          ? "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg hover:shadow-xl transform hover:scale-105"
                          : "bg-gray-300 cursor-not-allowed"
                      }`}
                      title="Send Message"
                    >
                      <PaperAirplaneIcon className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Footer Branding */}
                  <div className="flex-shrink-0 bg-white flex items-center justify-center py-2 sm:py-3 px-3 sm:px-4 space-x-2 border-t border-gray-200">
                    <div className="flex items-center space-x-2 sm:space-x-3">
                      <a
                        href="https://www.facebook.com/neurobrainsai"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:scale-110 transition-transform duration-200"
                      >
                        <Icon
                          icon="ri:facebook-fill"
                          width={10}
                          height={10}
                          className="text-blue-600 hover:text-blue-800 transition-colors duration-200 sm:w-3 sm:h-3"
                        />
                      </a>
                      <Separator
                        orientation="vertical"
                        className="h-4 sm:h-5 border-l border-gray-300"
                      />
                      <a
                        href="https://www.linkedin.com/company/neurobrainai/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:scale-110 transition-transform duration-200"
                      >
                        <Icon
                          icon="basil:linkedin-solid"
                          width={12}
                          height={12}
                          className="text-blue-500 hover:text-blue-700 transition-colors duration-200 sm:w-4 sm:h-4"
                        />
                      </a>
                      <Separator
                        orientation="vertical"
                        className="h-4 sm:h-5 border-l border-gray-300"
                      />
                    </div>
                    <p className="text-[10px] sm:text-[12px] text-gray-600">
                      Powered by{" "}
                      <a
                        href="https://neurobrains.co/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-gray-800 hover:text-blue-600 transition-colors duration-200 hover:underline"
                      >
                        NeuroBrain
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </>
  );
};

export default MessageAndCall;
